import { colorChannels, colormapBytes, WAVE_FILL, type WaveShape, type WaveStyle } from './draw'

// The wave shape rasterised on the GPU. The sampled values go up as a texture
// of one texel per column and row, and a fragment shader decides for every
// pixel whether it sits inside its column's width at that row, so the cost is
// the pixels on screen and nothing else: not the columns, not the rows, not a
// path with a point for each of them. One context is kept for the page,
// because a browser allows only a handful and drops the oldest past that.

const VERTEX = `#version 300 es
in vec2 aCorner;
out vec2 vUv;
void main() {
  vUv = aCorner * 0.5 + 0.5;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uValues;
uniform sampler2D uLut;
uniform float uColumns;
uniform float uFill;
uniform int uSilhouette;
uniform vec3 uFlat;
uniform vec3 uBackground;

void main() {
  float across = vUv.x * uColumns;
  float column = floor(across);
  float inside = across - column;
  // the texture holds one column per row of texels, and the canvas has y up
  // where the lane has time running down
  float value = texture(uValues, vec2(1.0 - vUv.y, (column + 0.5) / uColumns)).r;
  float reach = value * uFill * 0.5;
  float away = abs(inside - 0.5);
  // an edge a pixel wide, so the outline is drawn rather than stepped
  float edge = fwidth(inside) * 0.5;
  float cover = 1.0 - smoothstep(reach - edge, reach + edge, away);
  vec3 paint = uSilhouette == 1 ? uFlat : texture(uLut, vec2(value, 0.5)).rgb;
  fragColor = vec4(mix(uBackground, paint, cover), 1.0);
}`

type Renderer = {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
  program: WebGLProgram
  values: WebGLTexture
  lut: WebGLTexture
  lutFor: number
  uniforms: {
    columns: WebGLUniformLocation | null
    fill: WebGLUniformLocation | null
    silhouette: WebGLUniformLocation | null
    flat: WebGLUniformLocation | null
    background: WebGLUniformLocation | null
    values: WebGLUniformLocation | null
    lut: WebGLUniformLocation | null
  }
}

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

function texture(gl: WebGL2RenderingContext, filter: number): WebGLTexture {
  const held = gl.createTexture()
  if (!held) throw new Error('WebGL texture could not be created')
  gl.bindTexture(gl.TEXTURE_2D, held)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
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

  // the values are read linearly, so a lane taller than its rows is drawn as
  // a slope between them rather than as steps; the column axis is only ever
  // sampled at texel centres, so no column bleeds into the next
  gl.activeTexture(gl.TEXTURE0)
  const values = texture(gl, gl.LINEAR)
  gl.activeTexture(gl.TEXTURE1)
  const lut = texture(gl, gl.NEAREST)

  const uniforms = {
    columns: gl.getUniformLocation(program, 'uColumns'),
    fill: gl.getUniformLocation(program, 'uFill'),
    silhouette: gl.getUniformLocation(program, 'uSilhouette'),
    flat: gl.getUniformLocation(program, 'uFlat'),
    background: gl.getUniformLocation(program, 'uBackground'),
    values: gl.getUniformLocation(program, 'uValues'),
    lut: gl.getUniformLocation(program, 'uLut'),
  }
  gl.uniform1i(uniforms.values, 0)
  gl.uniform1i(uniforms.lut, 1)

  return { canvas, gl, program, values, lut, lutFor: -1, uniforms }
}

// Null when the browser has no WebGL2, so the caller can fall back to the
// pixel fill. The picture lands on a canvas shared between calls: the caller
// blits it straight away and does not keep it.
export function renderWaveGl(
  shape: WaveShape,
  width: number,
  height: number,
  colormap: number,
  background: string,
  style: WaveStyle,
  silhouette: string,
): HTMLCanvasElement | null {
  if (renderer === undefined) renderer = build()
  if (!renderer) return null

  const { canvas, gl, values, lut, uniforms } = renderer
  const { rows, columns } = shape
  if (rows === 0 || columns === 0 || width <= 0 || height <= 0) return null

  // a texture has a side the card will not go past; a window past it takes the
  // pixel fill rather than a picture missing its far columns
  const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
  if (rows > limit || columns > limit) return null

  const pixelWidth = Math.max(1, Math.round(width))
  const pixelHeight = Math.max(1, Math.round(height))
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  gl.viewport(0, 0, pixelWidth, pixelHeight)

  // the values arrive column-major, one column's rows together, which is the
  // layout of a texture `rows` wide: it is uploaded as that and read
  // transposed. Eight bits each: they are already on nought to one, a width is
  // at most a few hundred pixels, and only a byte texture filters linearly
  // without an extension
  const bytes = new Uint8Array(shape.values.length)
  for (let at = 0; at < bytes.length; at += 1) bytes[at] = (shape.values[at] * 255 + 0.5) | 0

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, values)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, rows, columns, 0, gl.RED, gl.UNSIGNED_BYTE, bytes)

  if (renderer.lutFor !== colormap) {
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, lut)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, colormapBytes(colormap))
    renderer.lutFor = colormap
  }

  gl.uniform1f(uniforms.columns, columns)
  gl.uniform1f(uniforms.fill, WAVE_FILL)
  gl.uniform1i(uniforms.silhouette, style === 'silhouette' ? 1 : 0)
  gl.uniform3fv(uniforms.flat, colorChannels(silhouette))
  gl.uniform3fv(uniforms.background, colorChannels(background))

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  return canvas
}
