import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allProgramSources } from '../../src/render/programs';

const have = spawnSync('glslangValidator', ['--version']).status === 0;

// three.js prefixes ShaderMaterial sources like this for WebGL2 (GLSL ES 3.00).
const VERT_PREFIX = `#version 300 es
#define attribute in
#define varying out
#define texture2D texture
precision highp float; precision highp int; precision highp sampler2D;
uniform mat4 modelMatrix; uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix; uniform mat4 viewMatrix;
uniform mat3 normalMatrix; uniform vec3 cameraPosition;
in vec3 position; in vec3 normal; in vec2 uv;
`;
const FRAG_PREFIX = `#version 300 es
#define varying in
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
#define texture2D texture
precision highp float; precision highp int; precision highp sampler2D;
uniform mat4 viewMatrix; uniform vec3 cameraPosition;
`;

describe('GLSL static validation (glslangValidator)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'awaken-glsl-'));
  const run = (file: string, stage: 'vert' | 'frag', body: string, prefix: string) => {
    const path = join(dir, `${file}.${stage}`);
    writeFileSync(path, prefix + body);
    return spawnSync('glslangValidator', ['-S', stage, path], { encoding: 'utf8' });
  };

  it.skipIf(!have && !process.env.CI)('validates every program', () => {
    if (!have) throw new Error('glslangValidator is required in CI (brew install glslang / apt install glslang-tools)');
    for (const [name, src] of Object.entries(allProgramSources())) {
      const v = run(name, 'vert', src.vertex, VERT_PREFIX);
      expect(v.status, `${name} vertex:\n${v.stdout}`).toBe(0);
      const f = run(name, 'frag', src.fragment, FRAG_PREFIX);
      expect(f.status, `${name} fragment:\n${f.stdout}`).toBe(0);
    }
  });

  it.skipIf(!have)('rejects a broken program (the validator is actually running)', () => {
    const r = run('broken', 'frag', 'void main(){ gl_FragColor = vec4(nope); }', FRAG_PREFIX);
    expect(r.status).not.toBe(0);
  });
});
