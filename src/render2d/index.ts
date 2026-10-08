/**
 * render2d — canvas renderers for device screens, the status tablet and printed receipts.
 *   import { render2d } from '@/render2d';
 * Contract: `./api.ts` (`Render2DApi` + layout constants).
 */
import type { Render2DApi } from './api';
import { drawDeviceDisplay } from './deviceScreens';
import { drawTablet } from './tablet';
import { drawReceipt, receiptHeightPx } from './receipt';

export * from './api';
export {
  effectiveButtons,
  localButtons,
  registerFirmwareLayoutProvider,
  hasFirmwareLayoutProvider,
  hitButton,
  btnCentre,
  displaySizeMm,
  type Btn,
  type LayoutQuery,
  type FirmwareLayoutProvider,
} from './deviceScreens';
export { tabletStatusText, buttonActive, drawTabletButton } from './tablet';
export { sampleReceiptText } from './receipt';
export { drawMark, drawWordmark, drawLabLogo } from './shared/labLogo';
export { drawQr, qrPattern } from './shared/qr';

export const render2d: Render2DApi = {
  drawDeviceDisplay,
  drawTablet,
  drawReceipt,
  receiptHeightPx: (text, widthPx) => receiptHeightPx(text, widthPx),
};
