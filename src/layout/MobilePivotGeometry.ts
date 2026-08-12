export type MobilePivotGeometryInput = {
  viewWidth: number;
  viewHeight: number;
  groupCount: number;
  maxProductsInGroup: number;
  cellSizeOverride?: number;
};

export type MobilePivotGeometry = {
  headerHeight: number;
  frameGap: number;
  itemGap: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  frameHeight: number;
  matrixWidth: number;
  matrixHeight: number;
  cellSize: number;
  rows: number;
};

const HEADER_HEIGHT = 36;
const FRAME_GAP = 4;
const ITEM_GAP = 1;
const HORIZONTAL_PADDING = 4;
const VERTICAL_PADDING = 4;
const MIN_CELL_SIZE = 1;

/**
 * Calculate the complete portrait-row budget independently from the renderer.
 * Every group header and product cell is fitted into the initial viewport.
 */
export function calculateMobilePivotGeometry(input: MobilePivotGeometryInput): MobilePivotGeometry {
  const groupCount = Math.max(1, input.groupCount);
  const totalGaps = FRAME_GAP * Math.max(0, groupCount - 1);
  const availableHeight = Math.max(
    groupCount,
    input.viewHeight - totalGaps - VERTICAL_PADDING * 2,
  );
  const frameHeight = availableHeight / groupCount;
  const matrixWidth = Math.max(1, input.viewWidth - HORIZONTAL_PADDING * 2);
  const matrixHeight = Math.max(1, frameHeight - HEADER_HEIGHT);

  const fitsAll = (cellSize: number): boolean => {
    const rows = Math.max(1, Math.floor((matrixHeight + ITEM_GAP) / (cellSize + ITEM_GAP)));
    const columns = Math.max(1, Math.floor((matrixWidth + ITEM_GAP) / (cellSize + ITEM_GAP)));
    return rows * columns >= input.maxProductsInGroup;
  };

  let cellSize = input.cellSizeOverride && input.cellSizeOverride > 0
    ? input.cellSizeOverride
    : MIN_CELL_SIZE;

  if (!input.cellSizeOverride && fitsAll(MIN_CELL_SIZE)) {
    let low = MIN_CELL_SIZE;
    let high = Math.max(low, Math.min(matrixWidth, matrixHeight));
    for (let index = 0; index < 30; index += 1) {
      const midpoint = (low + high) / 2;
      if (fitsAll(midpoint)) low = midpoint;
      else high = midpoint;
    }
    cellSize = low;
  }

  const rows = Math.max(1, Math.floor((matrixHeight + ITEM_GAP) / (cellSize + ITEM_GAP)));

  return {
    headerHeight: HEADER_HEIGHT,
    frameGap: FRAME_GAP,
    itemGap: ITEM_GAP,
    paddingTop: VERTICAL_PADDING,
    paddingRight: HORIZONTAL_PADDING,
    paddingBottom: VERTICAL_PADDING,
    paddingLeft: HORIZONTAL_PADDING,
    frameHeight,
    matrixWidth,
    matrixHeight,
    cellSize,
    rows,
  };
}
