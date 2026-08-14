export const getBatchCargoPageSizes = (studentCount: number): number[] => {
  if (!Number.isInteger(studentCount) || studentCount < 0) {
    throw new Error('La cantidad de alumnos debe ser un entero no negativo.');
  }
  if (studentCount <= 10) return [studentCount];

  const pageSizes = [10];
  let remaining = studentCount - 10;
  const continuationPages = Math.ceil((remaining + 1) / 16);

  for (let page = 0; page < continuationPages; page++) {
    const pagesLeft = continuationPages - page;
    const maxForPage = pagesLeft === 1 ? 15 : 16;
    const size = Math.min(maxForPage, Math.ceil(remaining / pagesLeft));
    pageSizes.push(size);
    remaining -= size;
  }

  return pageSizes;
};

export const paginateBatchCargoItems = <T>(items: T[]): T[][] => {
  const pages: T[][] = [];
  let offset = 0;
  for (const size of getBatchCargoPageSizes(items.length)) {
    pages.push(items.slice(offset, offset + size));
    offset += size;
  }
  return pages;
};
