import { prefixSums, WAVE_FILL, type Bar, type ColumnLayout, type WaveStyle } from './draw'
import { measure } from './trace'

// The compiled lanes rasterised on the GPU, on the canvas the page shows. The
// running totals of each source go up once as a texture and stay for as long
// as the song is open; a window change uploads two numbers per column, and a
// frame while playing changes the cursor's uniforms and draws one quad per
// panel. For every pixel the fragment shader finds its column and row, reads
// the two totals that bracket that row's frames, turns the mean into a colour
// or a width, and marks the cursor column over that. Nothing is copied to
// another canvas afterwards: the picture is drawn where it is seen, which on a
// browser that keeps its 2D canvases in software is the difference between a
// frame and a copy of a frame.
//
// One context per canvas, kept in a map by the canvas, and released when the
// canvas goes: a browser allows only a handful and drops the oldest past that.

const VERTEX = `#version 300 es
in vec2 aCorner;
out vec2 vUv;
void main() {
  vUv = aCorner * 0.5 + 0.5;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
// running totals, split into a float and what the float dropped, tiled into
// rows of uSumsWidth
uniform sampler2D uSums;
uniform int uSumsWidth;
// per column: the frame it starts on and the frames it spans
uniform sampler2D uBars;
// per level: the colour, and the curved level in the alpha
uniform sampler2D uLut;
uniform float uColumns;
// how the columns sit against the window: the plot starts uHead columns in
// and shows uShown of them
uniform float uHead;
uniform float uShown;
uniform float uRows;
uniform int uFrames;
uniform float uFill;
uniform float uScale;
// 0 paints every pixel its level's colour, 1 a coloured width, 2 a flat width
uniform int uStyle;
uniform vec3 uFlat;
uniform vec3 uBackground;
// the panel in window pixels, so the cursor can be placed in pixels
uniform float uPanelLeft;
uniform float uPanelBottom;
uniform float uPanelWidth;
uniform float uPanelHeight;
// the column the playhead is in (below nought for none), how far down it the
// playhead is, how the mark is painted (0 inverts, 1 cuts out, 2 lays a
// colour), and the widths of the outline round the column and the bar across it
uniform int uCursorColumn;
uniform float uCursorRow;
uniform int uCursorMode;
uniform vec3 uSolid;
uniform float uOutline;
uniform float uBar;

vec2 sumAt(int index) {
  return texelFetch(uSums, ivec2(index % uSumsWidth, index / uSumsWidth), 0).rg;
}

vec3 marked(vec3 c) {
  if (uCursorMode == 0) return vec3(1.0) - c;
  if (uCursorMode == 1) return uBackground;
  return uSolid;
}

void main() {
  float across = uHead + vUv.x * uShown;
  float column = clamp(floor(across), 0.0, uColumns - 1.0);
  // the bars are held as shares of the track, and become frames of this panel's
  // source here: the sources are not all cut to the same number of frames
  vec3 held = texelFetch(uBars, ivec2(int(column), 0), 0).rgb;
  vec2 bar = held.rg * float(uFrames);
  float step = bar.g / uRows;
  // the frame the column's own section ends at: past it the column is void
  int limit = min(uFrames, int(bar.r + bar.g * held.b + 0.5));

  // the canvas has y up where the lane has time running down. Consecutive rows
  // partition the frames between them, so each frame counts once and once only
  float row = floor((1.0 - vUv.y) * uRows);
  float at = bar.r + row * step;
  // read before the clamp: a row past the last frame is empty, not the last frame
  bool empty = int(at) >= limit;
  int from = min(int(at), uFrames - 1);
  int until = max(min(int(at + step), limit), from + 1);

  vec2 low = sumAt(from);
  vec2 high = sumAt(until);
  float mean = ((high.r - low.r) + (high.g - low.g)) / float(until - from);
  int level = int(clamp(mean, 0.0, 1.0) * 255.0 + 0.5);
  vec4 entry = texelFetch(uLut, ivec2(level, 0), 0);

  vec3 colour;
  if (empty) {
    colour = vec3(0.0);
  } else if (uStyle == 0) {
    colour = entry.rgb;
  } else {
    float value = min(1.0, entry.a * uScale);
    float reach = value * uFill * 0.5;
    float inside = across - column;
    float away = abs(inside - 0.5);
    // an edge a pixel wide, so the outline is drawn rather than stepped
    float edge = fwidth(inside) * 0.5;
    float cover = 1.0 - smoothstep(reach - edge, reach + edge, away);
    vec3 paint = uStyle == 2 ? uFlat : entry.rgb;
    colour = mix(uBackground, paint, cover);
  }

  if (uCursorColumn >= 0) {
    float localX = gl_FragCoord.x - uPanelLeft;
    float fromTop = uPanelHeight - (gl_FragCoord.y - uPanelBottom);
    float columnWidth = uPanelWidth / uShown;
    float start = (float(uCursorColumn) - uHead) * columnWidth;
    float stop = start + columnWidth;
    bool within = localX >= start && localX < stop;
    bool outline = (localX >= start - uOutline && localX < start) || (localX >= stop && localX < stop + uOutline);
    bool crossbar = within && abs(fromTop - uCursorRow * uPanelHeight) <= uBar * 0.5;
    if (crossbar || outline) colour = marked(colour);
  }

  fragColor = vec4(colour, 1.0);
}`

// One panel of one block: where it sits, what it reads and how it is painted.
// Sizes are CSS pixels; the renderer scales them by the device ratio.
export type LanePanel = {
  source: Float32Array
  stride: number
  channel: number
  lut: Uint8Array
  left: number
  top: number
  width: number
  height: number
  style: WaveStyle
  // what the curved level is multiplied by before it becomes a width, so the
  // loudest frame in view fills its column
  scale: number
}

export type LaneCursor = {
  column: number
  // how far down the column the playhead is, nought to one
  row: number
  mode: 'inverse' | 'cut' | 'solid'
  solid: [number, number, number]
  outline: number
  bar: number
}

type Uniforms = Record<
  | 'sums'
  | 'sumsWidth'
  | 'bars'
  | 'lut'
  | 'columns'
  | 'head'
  | 'shown'
  | 'rows'
  | 'frames'
  | 'fill'
  | 'scale'
  | 'style'
  | 'flat'
  | 'background'
  | 'panelLeft'
  | 'panelBottom'
  | 'panelWidth'
  | 'panelHeight'
  | 'cursorColumn'
  | 'cursorRow'
  | 'cursorMode'
  | 'solid'
  | 'outline'
  | 'bar',
  WebGLUniformLocation | null
>

type Renderer = {
  gl: WebGL2RenderingContext
  sums: WeakMap<Float32Array, WebGLTexture[]>
  bars: WebGLTexture
  luts: WebGLTexture[]
  // what the bars and lut textures hold, so a frame that changes only the
  // cursor uploads nothing
  barsKey: string
  lutFor: (Uint8Array | null)[]
  limit: number
  uniforms: Uniforms
}

const SUMS_WIDTH = 4096
const MAX_PANELS = 8

const renderers = new WeakMap<HTMLCanvasElement, Renderer | null>()

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind)
  if (!shader) throw new Error('WebGL shader could not be created')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`WebGL shader failed to compile: ${log}`)
  }
  return shader
}

function texture(gl: WebGL2RenderingContext): WebGLTexture {
  const held = gl.createTexture()
  if (!held) throw new Error('WebGL texture could not be created')
  gl.bindTexture(gl.TEXTURE_2D, held)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return held
}

function build(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: true })
  if (!gl) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`WebGL program failed to link: ${gl.getProgramInfoLog(program)}`)
  }
  gl.useProgram(program)

  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const corner = gl.getAttribLocation(program, 'aCorner')
  gl.enableVertexAttribArray(corner)
  gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0)

  gl.activeTexture(gl.TEXTURE1)
  const bars = texture(gl)
  const luts: WebGLTexture[] = []
  for (let panel = 0; panel < MAX_PANELS; panel += 1) {
    gl.activeTexture(gl.TEXTURE2 + panel)
    luts.push(texture(gl))
  }
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)

  const at = (name: string) => gl.getUniformLocation(program, name)
  const uniforms: Uniforms = {
    sums: at('uSums'),
    sumsWidth: at('uSumsWidth'),
    bars: at('uBars'),
    lut: at('uLut'),
    columns: at('uColumns'),
    head: at('uHead'),
    shown: at('uShown'),
    rows: at('uRows'),
    frames: at('uFrames'),
    fill: at('uFill'),
    scale: at('uScale'),
    style: at('uStyle'),
    flat: at('uFlat'),
    background: at('uBackground'),
    panelLeft: at('uPanelLeft'),
    panelBottom: at('uPanelBottom'),
    panelWidth: at('uPanelWidth'),
    panelHeight: at('uPanelHeight'),
    cursorColumn: at('uCursorColumn'),
    cursorRow: at('uCursorRow'),
    cursorMode: at('uCursorMode'),
    solid: at('uSolid'),
    outline: at('uOutline'),
    bar: at('uBar'),
  }
  gl.uniform1i(uniforms.sums, 0)
  gl.uniform1i(uniforms.bars, 1)
  gl.uniform1i(uniforms.sumsWidth, SUMS_WIDTH)
  gl.uniform1f(uniforms.fill, WAVE_FILL)

  return {
    gl,
    sums: new WeakMap(),
    bars,
    luts,
    barsKey: '',
    lutFor: new Array<Uint8Array | null>(MAX_PANELS).fill(null),
    limit: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    uniforms,
  }
}

function rendererFor(canvas: HTMLCanvasElement): Renderer | null {
  let held = renderers.get(canvas)
  if (held === undefined) {
    held = build(canvas)
    renderers.set(canvas, held)
  }
  return held
}

// Whether this canvas can show these lanes: a browser without WebGL2 cannot,
// nor can a window with more columns than a texture may be wide, and the
// caller paints on the CPU instead.
export function canRenderLanesGl(
  canvas: HTMLCanvasElement,
  bars: Bar[],
  panels: LanePanel[],
): boolean {
  const held = rendererFor(canvas)
  if (!held) return false
  if (bars.length === 0 || bars.length > held.limit || panels.length > MAX_PANELS) return false
  for (const panel of panels) {
    if (Math.ceil((panel.source.length / panel.stride + 1) / SUMS_WIDTH) > held.limit) return false
  }
  return true
}

// Gives the context back to the browser when the canvas is leaving the page.
export function releaseLanesGl(canvas: HTMLCanvasElement) {
  const held = renderers.get(canvas)
  if (held) held.gl.getExtension('WEBGL_lose_context')?.loseContext()
  renderers.delete(canvas)
}

// The running totals of one channel as a texture, built the first time the
// channel is drawn and kept with the array. Each total is a float and the
// remainder the float dropped, because a float alone loses the small
// difference between two large totals late in a song.
function sumsTexture(held: Renderer, source: Float32Array, stride: number, channel: number) {
  let textures = held.sums.get(source)
  if (!textures) {
    textures = []
    held.sums.set(source, textures)
  }
  const existing = textures[channel]
  if (existing) return existing

  const { gl } = held
  const sums = measure('lanes GL sums texture', () => prefixSums(source, stride, channel))
  const rows = Math.ceil(sums.length / SUMS_WIDTH)
  const data = new Float32Array(SUMS_WIDTH * rows * 2)
  for (let at = 0; at < sums.length; at += 1) {
    const whole = Math.fround(sums[at])
    data[at * 2] = whole
    data[at * 2 + 1] = sums[at] - whole
  }

  gl.activeTexture(gl.TEXTURE0)
  const made = texture(gl)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, SUMS_WIDTH, rows, 0, gl.RG, gl.FLOAT, data)
  textures[channel] = made
  return made
}

// Draws the lanes onto the canvas. Sizes are CSS pixels; the canvas is sized
// to them by the device ratio here.
export function renderLanesGl(
  canvas: HTMLCanvasElement,
  bars: Bar[],
  panels: LanePanel[],
  layout: ColumnLayout,
  width: number,
  height: number,
  ratio: number,
  background: [number, number, number],
  flat: [number, number, number],
  cursor: LaneCursor | null,
  // what the columns were made from, by the caller who knows: the bars are
  // uploaded again only when this changes. The ends alone cannot say, since a
  // section moved in the middle leaves them where they were
  barsKey: string,
) {
  const held = rendererFor(canvas)
  if (!held || !canRenderLanesGl(canvas, bars, panels)) return

  const { gl, uniforms } = held
  const columns = bars.length

  const pixelWidth = Math.max(1, Math.round(width * ratio))
  const pixelHeight = Math.max(1, Math.round(height * ratio))
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  gl.viewport(0, 0, pixelWidth, pixelHeight)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)

  gl.uniform1f(uniforms.columns, columns)
  gl.uniform1f(uniforms.head, layout.head)
  gl.uniform1f(uniforms.shown, layout.shown)
  gl.uniform3fv(uniforms.flat, flat)
  gl.uniform3fv(uniforms.background, background)

  if (cursor) {
    gl.uniform1i(uniforms.cursorColumn, cursor.column)
    gl.uniform1f(uniforms.cursorRow, cursor.row)
    gl.uniform1i(uniforms.cursorMode, cursor.mode === 'inverse' ? 0 : cursor.mode === 'cut' ? 1 : 2)
    gl.uniform3fv(uniforms.solid, cursor.solid)
    gl.uniform1f(uniforms.outline, cursor.outline * ratio)
    gl.uniform1f(uniforms.bar, cursor.bar * ratio)
  } else {
    gl.uniform1i(uniforms.cursorColumn, -1)
  }

  // the columns as shares of the track, turned into each panel's own frames in
  // the shader; the upload is skipped while the window holds the same bars
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, held.bars)
  if (held.barsKey !== barsKey) {
    const data = new Float32Array(columns * 3)
    for (let index = 0; index < columns; index += 1) {
      data[index * 3] = bars[index].start
      data[index * 3 + 1] = bars[index].end - bars[index].start
      data[index * 3 + 2] = bars[index].filled
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, columns, 1, 0, gl.RGB, gl.FLOAT, data)
    held.barsKey = barsKey
  }

  panels.forEach((panel, slot) => {
    const panelFrames = panel.source.length / panel.stride

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sumsTexture(held, panel.source, panel.stride, panel.channel))

    // each panel keeps its own lut texture, uploaded when its table changes
    gl.activeTexture(gl.TEXTURE2 + slot)
    gl.bindTexture(gl.TEXTURE_2D, held.luts[slot])
    if (held.lutFor[slot] !== panel.lut) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, panel.lut)
      held.lutFor[slot] = panel.lut
    }
    gl.uniform1i(uniforms.lut, 2 + slot)

    const left = Math.round(panel.left * ratio)
    const top = Math.round(panel.top * ratio)
    const panelWidth = Math.max(1, Math.round(panel.width * ratio))
    const panelHeight = Math.max(1, Math.round(panel.height * ratio))
    // GL counts rows from the bottom
    const bottom = pixelHeight - top - panelHeight

    gl.uniform1f(uniforms.rows, panelHeight)
    gl.uniform1i(uniforms.frames, panelFrames)
    gl.uniform1f(uniforms.scale, panel.scale)
    gl.uniform1i(uniforms.style, panel.style === 'colour' ? 0 : panel.style === 'shape' ? 1 : 2)
    gl.uniform1f(uniforms.panelLeft, left)
    gl.uniform1f(uniforms.panelBottom, bottom)
    gl.uniform1f(uniforms.panelWidth, panelWidth)
    gl.uniform1f(uniforms.panelHeight, panelHeight)

    gl.viewport(left, bottom, panelWidth, panelHeight)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  })
}
