export const createChart = jest.fn(() => ({
  addCandlestickSeries: jest.fn(() => ({
    setData: jest.fn(),
    update: jest.fn(),
    applyOptions: jest.fn(),
    setMarkers: jest.fn(),
  })),
  remove: jest.fn(),
  resize: jest.fn(),
  applyOptions: jest.fn(),
  subscribeClick: jest.fn(),
  subscribeCrosshairMove: jest.fn(),
}));
export const CandlestickSeries = jest.fn();
export default { createChart, CandlestickSeries };
