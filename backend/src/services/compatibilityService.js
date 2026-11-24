'use strict';
/**
 * LEVEL 3 – PC Compatibility Engine (pure business rules, no I/O).
 *
 * Input: a list of { slot?, quantity, product: { id, name, specs, category: { componentType } } }
 * Output: { compatible, errors[], warnings[], estimatedWattage, recommendedPsuWatts, parts }
 *
 * Rule catalogue (docs/business-rules.md, section L3-A):
 *  SOCKET_MISMATCH        CPU socket must equal motherboard socket
 *  RAM_TYPE_MISMATCH      RAM generation (DDR4/DDR5) must equal the board's
 *  CPU_MEMORY_UNSUPPORTED CPU must support the board's memory type
 *  RAM_SLOTS_EXCEEDED     total RAM sticks must fit the board's slots
 *  FORM_FACTOR_MISMATCH   case must support the board form factor
 *  GPU_TOO_LONG           GPU length must fit the case
 *  PSU_INSUFFICIENT       PSU watts must cover the estimated draw   (error)
 *  PSU_LOW_HEADROOM       PSU below recommended headroom            (warning)
 *  NO_DISPLAY_OUTPUT      no GPU and CPU has no integrated graphics (warning)
 *  MULTIPLE_PARTS         >1 distinct product of a pair type – pair checks skipped (warning)
 *  SLOT_TYPE_MISMATCH     build slot does not match product type (error, builds only)
 *  DUPLICATE_SLOT         >1 product in a single-part slot (error, builds only)
 */
const BASE_SYSTEM_WATTS = 80; // board, RAM, storage, fans
const HEADROOM = 1.3;
const SINGLE_SLOTS = ['CPU', 'MOTHERBOARD', 'GPU', 'PSU', 'CASE'];

const typeOf = (line) => line.product?.category?.componentType;
const specs = (line) => (line?.product?.specs && typeof line.product.specs === 'object' ? line.product.specs : {});
const supportsMemory = (cpuMem, boardMem) => String(cpuMem || '').split('/').map((s) => s.trim()).includes(boardMem);

function evaluate(lines, { mode = 'cart' } = {}) {
  const errors = [];
  const warnings = [];
  const err = (code, message) => errors.push({ code, message });
  const warn = (code, message) => warnings.push({ code, message });

  if (mode === 'build') {
    const perSlot = {};
    for (const l of lines) {
      if (l.slot && l.slot !== typeOf(l)) err('SLOT_TYPE_MISMATCH', `${l.product.name} is a ${typeOf(l)}, not a ${l.slot}`);
      perSlot[l.slot] = (perSlot[l.slot] || 0) + 1;
    }
    for (const s of SINGLE_SLOTS) if (perSlot[s] > 1) err('DUPLICATE_SLOT', `A build can only have one ${s}`);
  }

  // Group distinct products by component type
  const byType = {};
  for (const l of lines) {
    const t = typeOf(l);
    if (!t) continue;
    (byType[t] = byType[t] || []).push(l);
  }
  const one = (t) => {
    const list = byType[t] || [];
    if (list.length > 1) {
      warn('MULTIPLE_PARTS', `More than one ${t} selected – compatibility checks involving ${t} were skipped`);
      return null;
    }
    return list[0] || null;
  };

  const cpu = one('CPU');
  const board = one('MOTHERBOARD');
  const gpu = one('GPU');
  const psu = one('PSU');
  const pcCase = one('CASE');
  const rams = byType.RAM || [];

  if (cpu && board) {
    if (specs(cpu).socket && specs(board).socket && specs(cpu).socket !== specs(board).socket) {
      err('SOCKET_MISMATCH', `${cpu.product.name} (${specs(cpu).socket}) does not fit ${board.product.name} (${specs(board).socket})`);
    }
    if (specs(cpu).memoryType && specs(board).memoryType && !supportsMemory(specs(cpu).memoryType, specs(board).memoryType)) {
      err('CPU_MEMORY_UNSUPPORTED', `${cpu.product.name} does not support ${specs(board).memoryType}`);
    }
  }

  if (board && rams.length) {
    for (const r of rams) {
      if (specs(r).memoryType && specs(board).memoryType && specs(r).memoryType !== specs(board).memoryType) {
        err('RAM_TYPE_MISMATCH', `${r.product.name} is ${specs(r).memoryType} but ${board.product.name} needs ${specs(board).memoryType}`);
      }
    }
    const sticks = rams.reduce((n, r) => n + (Number(specs(r).modules) || 1) * (r.quantity || 1), 0);
    if (specs(board).ramSlots && sticks > specs(board).ramSlots) {
      err('RAM_SLOTS_EXCEEDED', `${sticks} memory sticks selected but ${board.product.name} has ${specs(board).ramSlots} slots`);
    }
  }

  if (board && pcCase) {
    const supported = specs(pcCase).supportedFormFactors || [];
    if (specs(board).formFactor && supported.length && !supported.includes(specs(board).formFactor)) {
      err('FORM_FACTOR_MISMATCH', `${pcCase.product.name} does not fit a ${specs(board).formFactor} motherboard`);
    }
  }

  if (gpu && pcCase && specs(gpu).lengthMm && specs(pcCase).maxGpuLengthMm && specs(gpu).lengthMm > specs(pcCase).maxGpuLengthMm) {
    err('GPU_TOO_LONG', `${gpu.product.name} is ${specs(gpu).lengthMm}mm; ${pcCase.product.name} fits up to ${specs(pcCase).maxGpuLengthMm}mm`);
  }

  const cpuW = cpu ? Number(specs(cpu).tdpWatts) || 0 : 0;
  const gpuW = gpu ? Number(specs(gpu).tdpWatts) || 0 : 0;
  const estimatedWattage = cpu || gpu ? BASE_SYSTEM_WATTS + cpuW + gpuW : null;
  const recommendedPsuWatts = estimatedWattage
    ? Math.max(Math.ceil((estimatedWattage * HEADROOM) / 50) * 50, gpu ? Number(specs(gpu).recommendedPsuWatts) || 0 : 0)
    : null;

  if (psu && estimatedWattage) {
    const w = Number(specs(psu).wattage) || 0;
    if (w < estimatedWattage) {
      err('PSU_INSUFFICIENT', `${psu.product.name} (${w}W) is below the estimated ${estimatedWattage}W draw`);
    } else if (w < recommendedPsuWatts) {
      warn('PSU_LOW_HEADROOM', `${psu.product.name} (${w}W) works but ${recommendedPsuWatts}W is recommended`);
    }
  }

  if (cpu && !gpu && specs(cpu).integratedGraphics === false) {
    warn('NO_DISPLAY_OUTPUT', `${cpu.product.name} has no integrated graphics – add a graphics card`);
  }

  if (mode === 'build') {
    for (const s of ['CPU', 'MOTHERBOARD', 'RAM', 'PSU', 'CASE', 'STORAGE']) {
      if (!byType[s]) warn('MISSING_PART', `Build has no ${s} yet`);
    }
  }

  return { compatible: errors.length === 0, errors, warnings, estimatedWattage, recommendedPsuWatts };
}

module.exports = { evaluate, BASE_SYSTEM_WATTS, HEADROOM };
