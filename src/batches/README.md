# Batches Module

## Overview

The Batches module implements branch-specific inventory batch management with FEFO (First Expiry First Out) dispensing logic for the pharmacy POS system.

## Key Features

### 1. Batch Management
- Branch-specific batch tracking
- Expiry date management
- Lot number tracking
- Supplier association
- Automatic depletion marking

### 2. FEFO Batch Selection Logic

The core FEFO implementation is in `BatchesService.selectBatchesForSale()` method.

**Requirements Addressed:**
- Requirement 2.3: Multiple batches ordered by expiry date for FEFO dispensing
- Requirement 5.1: Automatic batch selection by earliest expiry date
- Requirement 5.2: Multi-batch selection for large quantities
- Requirement 5.5: Exclusion of expired batches

**Correctness Properties:**
- Property 19: FEFO batch selection - batches selected in expiry order
- Property 20: Multi-batch FEFO - automatic selection across multiple batches
- Property 21: Expired batch exclusion - expired batches not dispensed

**Algorithm:**
1. Query available batches for the product at the branch
2. Filter out expired and depleted batches (done in repository)
3. Sort by expiry date ascending (earliest first)
4. Iterate through batches, selecting quantities in FEFO order
5. Handle multi-batch selection when quantity spans batches
6. Return error if insufficient stock

**Example:**
```typescript
const selection = await batchesService.selectBatchesForSale({
  branchId: '507f1f77bcf86cd799439011',
  productId: '507f1f77bcf86cd799439012',
  quantityNeeded: 80
});

// Returns:
// [
//   { batchId: 'batch1', quantity: 50, expiryDate: '2025-03-01', ... },
//   { batchId: 'batch2', quantity: 30, expiryDate: '2025-06-01', ... }
// ]
```

### 3. Repository Methods

**`findAvailableForFEFO(branchId, productId)`**
- Returns batches sorted by expiry date (earliest first)
- Excludes expired batches (expiryDate < now)
- Excludes depleted batches (quantityAvailable <= 0)
- Excludes batches marked as expired (isExpired = true)

**Compound Index:**
```javascript
{ branchId: 1, productId: 1, expiryDate: 1 }
```
This index optimizes FEFO queries by allowing efficient filtering and sorting.

### 4. Batch Lifecycle

1. **Creation**: Batch created with initial quantity
2. **Dispensing**: Quantity decremented via `updateQuantity()`
3. **Depletion**: When quantity reaches 0, marked as depleted (retained for audit)
4. **Expiry**: When expiry date passes, marked as expired

### 5. Data Model

```typescript
{
  productId: ObjectId,        // Reference to global product
  branchId: ObjectId,         // Branch-specific batch
  lotNumber: string,          // Supplier lot number
  expiryDate: Date,           // Expiry date for FEFO
  quantityAvailable: number,  // Current stock
  quantityInitial: number,    // Original quantity
  purchasePrice: number,      // Cost price
  sellingPrice: number,       // Retail price
  supplierId: ObjectId,       // Supplier reference
  isExpired: boolean,         // Expiry flag
  isDepleted: boolean,        // Depletion flag
  createdAt: Date,
  updatedAt: Date
}
```

## Usage

### Creating a Batch

```typescript
const batch = await batchesService.create({
  productId: '507f1f77bcf86cd799439011',
  branchId: '507f1f77bcf86cd799439012',
  lotNumber: 'LOT-2025-001',
  expiryDate: new Date('2025-12-31'),
  quantity: 100,
  purchasePrice: 50,
  sellingPrice: 75,
  supplierId: '507f1f77bcf86cd799439013'
});
```

### Selecting Batches for Sale (FEFO)

```typescript
const selectedBatches = await batchesService.selectBatchesForSale({
  branchId: '507f1f77bcf86cd799439012',
  productId: '507f1f77bcf86cd799439011',
  quantityNeeded: 50
});

// Use selected batches in checkout process
for (const batch of selectedBatches) {
  await batchesService.updateQuantity(batch.batchId, -batch.quantity);
}
```

### Finding Expiring Batches

```typescript
// Get batches expiring in next 30 days
const expiringBatches = await batchesService.findExpiring(branchId, 30);
```

### Marking Expired Batches

```typescript
// Mark all expired batches (scheduled job)
const count = await batchesService.markExpiredBatches();
console.log(`Marked ${count} batches as expired`);
```

## Testing

### Unit Tests
- `batches.service.spec.ts`: Service layer tests with mocked repository
- `batches.fefo.spec.ts`: FEFO algorithm logic tests

### Property-Based Tests
Property-based tests should be implemented to verify:
- Property 19: FEFO ordering across random batch sets
- Property 20: Multi-batch selection with varying quantities
- Property 21: Expired batch exclusion with random dates

## Integration with Sales Module

The Sales/Checkout module should use the FEFO selection:

```typescript
// In CheckoutService
const batches = await this.batchesService.selectBatchesForSale({
  branchId: sale.branchId,
  productId: item.productId,
  quantityNeeded: item.quantity
});

// Within MongoDB transaction
for (const batch of batches) {
  await this.batchesService.updateQuantity(batch.batchId, -batch.quantity);
  // Create stock movement record
  // Add to sale items
}
```

## Error Handling

- **BadRequestException**: Missing required fields, insufficient stock, no available batches
- **NotFoundException**: Batch not found by ID

## Future Enhancements

1. Batch reservation for pending sales
2. Batch transfer between branches
3. Batch recall functionality
4. Batch quality control flags
5. Batch temperature monitoring integration
