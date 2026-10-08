/** Minimal typings for n8ao (the package ships none). */
declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three';
  import { Pass } from 'postprocessing';

  export interface N8AOConfiguration {
    aoSamples: number;
    aoRadius: number;
    aoTones: number;
    denoiseSamples: number;
    denoiseRadius: number;
    distanceFalloff: number;
    intensity: number;
    denoiseIterations: number;
    renderMode: 0 | 1 | 2 | 3 | 4;
    biasOffset: number;
    biasMultiplier: number;
    color: Color;
    gammaCorrection: boolean;
    screenSpaceRadius: boolean;
    halfRes: boolean;
    depthAwareUpsampling: boolean;
    colorMultiply: boolean;
    transparencyAware: boolean;
    accumulate: boolean;
    neuralDenoise: boolean;
  }

  export type N8AOQualityMode = 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra' | 'Neural-Low' | 'Neural-Medium' | 'Neural-High';

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: N8AOConfiguration;
    setQualityMode(mode: N8AOQualityMode): void;
    setDisplayMode(mode: 'Combined' | 'AO' | 'No AO' | 'Split' | 'Split AO'): void;
    setSize(width: number, height: number): void;
  }

  export class N8AOPass extends N8AOPostPass {}
}
