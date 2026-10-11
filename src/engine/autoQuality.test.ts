import { describe, expect, it } from 'vitest';
import { FrameTimeWatch, presetForHardware, type HardwareInfo } from './autoQuality';

const desktop: HardwareInfo = {
  phone: false,
  tablet: false,
  chromebook: false,
  cores: 12,
  memoryGb: 8,
  gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  maxTextureSize: 16384,
  screenLong: 1920,
  screenShort: 1080,
  dpr: 1,
};

describe('presetForHardware', () => {
  it('leaves a capable desktop uncapped', () => {
    expect(presetForHardware(desktop).preset).toBe('ultra');
  });

  it('software rasterisers get potato', () => {
    for (const gpu of ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Microsoft Basic Render Driver']) {
      expect(presetForHardware({ ...desktop, gpu }).preset).toBe('potato');
    }
  });

  it('phones get potato, tablets low', () => {
    expect(presetForHardware({ ...desktop, phone: true, gpu: 'Apple GPU' }).preset).toBe('potato');
    expect(presetForHardware({ ...desktop, tablet: true, gpu: 'Apple GPU' }).preset).toBe('low');
  });

  it('memory and cores cap the preset', () => {
    expect(presetForHardware({ ...desktop, memoryGb: 2 }).preset).toBe('potato');
    expect(presetForHardware({ ...desktop, memoryGb: 4 }).preset).toBe('low');
    expect(presetForHardware({ ...desktop, cores: 2 }).preset).toBe('potato');
    expect(presetForHardware({ ...desktop, cores: 4 }).preset).toBe('low');
  });

  it('Intel integrated GPUs: old HD → potato, UHD → low, Iris → medium', () => {
    expect(presetForHardware({ ...desktop, gpu: 'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0)' }).preset).toBe('potato');
    expect(presetForHardware({ ...desktop, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)' }).preset).toBe('low');
    expect(presetForHardware({ ...desktop, gpu: 'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0)' }).preset).toBe('low');
    expect(presetForHardware({ ...desktop, gpu: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0)' }).preset).toBe('medium');
  });

  it('old mobile GPUs and small texture limits get potato; Chromebooks low', () => {
    expect(presetForHardware({ ...desktop, gpu: 'Mali-T860' }).preset).toBe('potato');
    expect(presetForHardware({ ...desktop, gpu: 'Adreno (TM) 506' }).preset).toBe('potato');
    expect(presetForHardware({ ...desktop, maxTextureSize: 2048 }).preset).toBe('potato');
    expect(presetForHardware({ ...desktop, chromebook: true }).preset).toBe('low');
    expect(presetForHardware({ ...desktop, chromebook: true, memoryGb: 4 }).preset).toBe('potato');
  });
});

describe('FrameTimeWatch', () => {
  it('ignores the warm-up, then needs N consecutive slow windows', () => {
    const w = new FrameTimeWatch(45, 3, 2);
    expect(w.sample(200)).toBe('warming');
    expect(w.sample(200)).toBe('warming');
    expect(w.sample(60)).toBe('ok');
    expect(w.sample(60)).toBe('ok');
    expect(w.sample(20)).toBe('ok'); // a fast window resets the run
    expect(w.sample(60)).toBe('ok');
    expect(w.sample(60)).toBe('ok');
    expect(w.sample(60)).toBe('slow');
  });

  it('extra condition gates slowness; reset restarts the warm-up', () => {
    const w = new FrameTimeWatch(50, 2, 0);
    expect(w.sample(80, false)).toBe('ok');
    expect(w.sample(80, false)).toBe('ok');
    expect(w.sample(80, true)).toBe('ok');
    expect(w.sample(80, true)).toBe('slow');
    w.reset();
    expect(w.sample(80)).toBe('ok');
  });
});
