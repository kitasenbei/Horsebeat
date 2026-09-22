import { prefixSums, WAVE_FILL, type Bar, type WaveStyle } from './draw'

// The compiled lanes rasterised on the GPU. The running totals of each source
// go up once as a texture and stay for as long as the song is open; a rebuild
// uploads two numbers per column and draws one quad per panel. For every pixel
// the fragment shader finds its column and row, reads the two totals that
// bracket that row's frames, and turns the mean into a colour, or a width for
// the shape styles. What the CPU does per rebuild no longer grows with the
// picture: the pixels are the GPU's, and their number is the screen's.
//
// One context is kept for the page, because a browser allows only a handful
// and drops the oldest past that.

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
uniform float uRows;
uniform int uFrames;
uniform float uFill;
uniform float uScale;
// 0 paints every pixel its level's colour, 1 a coloured width, 2 a flat width
uniform int uStyle;
uniform vec3 uFlat;
uniform vec3 uBackground;

vec2 sumAt(int index) {
  return texelFetch(uSums, ivec2(index % uSumsWidth, index / uSumsWidth), 0).rg;
}

void main() {
  float across = vUv.x * uColumns;
  float column = floor(across);
  vec2 bar = texelFetch(uBars, ivec2(int(column), 0), 0).rg;
  float step = bar.g / uRows;

  // the canvas has y up where the lane has time running down. Consecutive rows
  // partition the frames between them, so each frame counts once and once only
  float row = floor((1.0 - vUv.y) * uRows);
  float at = bar.r + row * step;
  int from = min(int(at), uFrames - 1);
  int until = min(max(int(at + step), from + 1), uFrames);

  vec2 low = sumAt(from);
  vec2 high = sumAt(until);
  float mean = ((high.r - low.r) + (high.g - low.g)) / float(until - from);
  int level = int(clamp(mean, 0.0, 1.0) * 255.0 + 0.5);
  vec4 entry = texelFetch(uLut, ivec2(level, 0), 0);

  if (uStyle == 0) {
    fragColor = vec4(entry.rgb, 1.0);
    return;
  }

  float value = min(1.0, entry.a * uScale);
  float reach = value * uFill * 0.5;
  float inside = across - column;
  float away = abs(inside - 0.5);
  // an edge a pixel wide, so the outline is drawn rather than stepped
  float edge = fwidth(inside) * 0.5;
  float cover = 1.0 - smoothstep(reach - edge, reach + edge, away);
  vec3 paint = uStyle == 2 ? uFlat : entry.rgb;
  fragColor = vec4(mix(uBackground, paint, cover), 1.0);
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

type Renderer = {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
  sums: WeakMap<Float32Array, WebGLTexture[]>
  bars: WebGLTexture
  lut: WebGLTexture
  limit: number
  uniforms: Record<
    | 'sums'
    | 'sumsWidth'
    | 'bars'
    | 'lut'
    | 'columns'
    | 'rows'
    | 'frames'
    | 'fill'
    | 'scale'
    | 'style'
    | 'flat'
    | 'background',
    WebGLUniformLocation | null
  >
}

const SUMS_WIDTH = 4096

let renderer: Renderer | null | undefined

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

function build(): Renderer | null {
  const canvas = document.createElement('canvas')
  // the picture is read back by drawImage after the frame, so the buffer has
  // to survive it
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false })
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
  gl.activeTexture(gl.TEXTURE2)
  const lut = texture(gl)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)

  const at = (name: string) => gl.getUniformLocation(program, name)
  const uniforms = {
    sums: at('uSums'),
    sumsWidth: at('uSumsWidth'),
    bars: at('uBars'),
    lut: at('uLut'),
    columns: at('uColumns'),
    rows: at('uRows'),
    frames: at('uFrames'),
    fill: at('uFill'),
    scale: at('uScale'),
    style: at('uStyle'),
    flat: at('uFlat'),
    background: at('uBackground'),
  }
  gl.uniform1i(uniforms.sums, 0)
  gl.uniform1i(uniforms.bars, 1)
  gl.uniform1i(uniforms.lut, 2)
  gl.uniform1i(uniforms.sumsWidth, SUMS_WIDTH)
  gl.uniform1f(uniforms.fill, WAVE_FILL)

  return {
    canvas,
    gl,
    sums: new WeakMap(),
    bars,
    lut,
    limit: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    uniforms,
  }
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
  const sums = prefixSums(source, stride, channel)
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

// Null when the browser has no WebGL2, or the window holds more columns than
// a texture may be wide, so the caller can paint on the CPU instead. The
// picture lands on a canvas shared between calls: the caller blits it and
// does not keep it.
export function renderLanesGl(
  bars: Bar[],
  panels: LanePanel[],
  width: number,
  height: number,
  ratio: number,
  background: [number, number, number],
  flat: [number, number, number],
): HTMLCanvasElement | null {
  if (renderer === undefined) renderer = build()
  if (!renderer) return null

  const held = renderer
  const { canvas, gl, uniforms } = held
  const columns = bars.length
  if (columns === 0 || width <= 0 || height <= 0 || columns > held.limit) return null
  for (const panel of panels) {
    if (Math.ceil((panel.source.length / panel.stride + 1) / SUMS_WIDTH) > held.limit) return null
  }

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
  gl.uniform3fv(uniforms.flat, flat)
  gl.uniform3fv(uniforms.background, background)

  // texture uploads bind to the active unit, so the units are set once here
  // and every upload below names its own
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, held.lut)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, held.bars)

  let uploadedFrames = -1
  for (const panel of panels) {
    const frames = panel.source.length / panel.stride

    // the columns in frames of this panel's source: the same bars, but each
    // source has its own frame count
    if (uploadedFrames !== frames) {
      const data = new Float32Array(columns * 2)
      for (let index = 0; index < columns; index += 1) {
        data[index * 2] = bars[index].start * frames
        data[index * 2 + 1] = (bars[index].end - bars[index].start) * frames
      }
      gl.activeTexture(gl.TEXTURE1)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, columns, 1, 0, gl.RG, gl.FLOAT, data)
      uploadedFrames = frames
    }

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, sumsTexture(held, panel.source, panel.stride, panel.channel))

    gl.activeTexture(gl.TEXTURE2)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, panel.lut)

    const left = Math.round(panel.left * ratio)
    const top = Math.round(panel.top * ratio)
    const panelWidth = Math.max(1, Math.round(panel.width * ratio))
    const panelHeight = Math.max(1, Math.round(panel.height * ratio))

    gl.uniform1f(uniforms.rows, panelHeight)
    gl.uniform1i(uniforms.frames, frames)
    gl.uniform1f(uniforms.scale, panel.scale)
    gl.uniform1i(uniforms.style, panel.style === 'colour' ? 0 : panel.style === 'shape' ? 1 : 2)

    // GL counts rows from the bottom
    gl.viewport(left, pixelHeight - top - panelHeight, panelWidth, panelHeight)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  return canvas
}
