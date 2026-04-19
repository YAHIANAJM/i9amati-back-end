/**
 * Smart Distribution Engine for Co-ownership Expenses
 * Following Moroccan Decree Article 8 logic
 */

/**
 * Distribute based on ownership percentage (Common Shares / Hissas)
 */
export const distributeByHissas = (amount, apartments) => {
  const totalPercentage = apartments.reduce((sum, apt) => sum + (apt.percentage_of_apartment || 0), 0);
  if (totalPercentage === 0) return apartments.map(apt => ({ ...apt, share: 0 }));

  return apartments.map(apt => ({
    apartmentId: apt._id,
    unit_code: apt.unit_code,
    share: Math.round(((amount * (apt.percentage_of_apartment || 0)) / totalPercentage) * 100) / 100
  }));
};

/**
 * Distribute equally across all units
 */
export const distributeByEquality = (amount, apartments) => {
  if (apartments.length === 0) return [];
  const individualShare = Math.round((amount / apartments.length) * 100) / 100;

  return apartments.map(apt => ({
    apartmentId: apt._id,
    unit_code: apt.unit_code,
    share: individualShare
  }));
};

/**
 * Distribute based on floor level with weights
 * @param {Number} amount 
 * @param {Array} apartments 
 * @param {Object} floorWeights { "0": 0.0, "1": 0.5, "2": 1.0, ... }
 */
export const distributeByFloor = (amount, apartments, floorWeights = {}) => {
  // Calculate total weight
  let totalWeight = 0;
  const weightedApartments = apartments.map(apt => {
    const weight = floorWeights[apt.floor.toString()] !== undefined ? floorWeights[apt.floor.toString()] : 1.0;
    totalWeight += weight;
    return { ...apt, weight };
  });

  if (totalWeight === 0) return apartments.map(apt => ({ ...apt, share: 0 }));

  return weightedApartments.map(apt => ({
    apartmentId: apt._id,
    unit_code: apt.unit_code,
    share: Math.round(((amount * apt.weight) / totalWeight) * 100) / 100
  }));
};

/**
 * Distribute based on Mixed logic (50% Hissas / 50% Equality)
 */
export const distributeByMixed = (amount, apartments) => {
  const halfAmount = amount / 2;
  const hissasShares = distributeByHissas(halfAmount, apartments);
  const equalityShares = distributeByEquality(halfAmount, apartments);

  return apartments.map((apt, index) => ({
    apartmentId: apt._id,
    unit_code: apt.unit_code,
    share: Math.round((hissasShares[index].share + equalityShares[index].share) * 100) / 100
  }));
};

/**
 * Distribute specifically for a building or subset
 */
export const distributeByBuilding = (amount, apartments, distributionType = 'hissas') => {
  if (distributionType === 'equality') {
    return distributeByEquality(amount, apartments);
  }
  return distributeByHissas(amount, apartments);
};
