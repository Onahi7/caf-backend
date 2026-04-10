# Purchases Module

This module handles purchase order management and receiving for the pharmacy POS system.

## Features

- Create purchase orders with multiple items
- Track purchase order status (pending, partially received, completed, cancelled)
- Receive purchase orders (full or partial receipt)
- Automatic batch creation on receipt
- Automatic stock movement recording
- Transaction-based receiving for data integrity
- Filter purchase orders by branch, supplier, status, and date range

## Requirements

Implements requirements:
- 19.1: Purchase order creation with supplier, branch, products, and delivery date
- 19.2: Purchase order receiving creates batches and stock movements
- 19.3: Purchase order status tracking
- 19.4: Partial receipt support
- 19.5: Purchase order reports by supplier, branch, and date range

## Correctness Properties

Validates properties:
- **Property 71**: Purchase order structure - All POs contain required fields
- **Property 72**: PO receiving creates batches - Receiving creates batches and stock movements
- **Property 73**: PO status tracking - Status field accepts all valid values
- **Property 74**: Partial PO receipt - System allows receiving subset of ordered items

## API Endpoints

### POST /purchase-orders
Create a new purchase order.

**Request Body:**
```json
{
  "supplierId": "507f1f77bcf86cd799439011",
  "branchId": "507f1f77bcf86cd799439012",
  "items": [
    {
      "productId": "507f1f77bcf86cd799439013",
      "quantity": 100,
      "unitPrice": 50.00
    }
  ],
  "expectedDeliveryDate": "2024-01-15T00:00:00Z",
  "createdBy": "507f1f77bcf86cd799439014",
  "notes": "Urgent order"
}
```

### GET /purchase-orders
Get all purchase orders with optional filtering.

**Query Parameters:**
- `supplierId` (optional): Filter by supplier
- `branchId` (optional): Filter by branch
- `status` (optional): Filter by status (pending, partially_received, completed, cancelled)
- `startDate` (optional): Filter by creation date (from)
- `endDate` (optional): Filter by creation date (to)

### GET /purchase-orders/pending
Get all pending purchase orders.

### GET /purchase-orders/branch/:branchId
Get purchase orders for a specific branch.

### GET /purchase-orders/supplier/:supplierId
Get purchase orders for a specific supplier.

### GET /purchase-orders/:id
Get a single purchase order by ID.

### POST /purchase-orders/:id/receive
Receive items from a purchase order.

**Request Body:**
```json
{
  "receivedItems": [
    {
      "productId": "507f1f77bcf86cd799439013",
      "receivedQuantity": 50,
      "lotNumber": "LOT-2024-001",
      "expiryDate": "2025-12-31T00:00:00Z",
      "sellingPrice": 75.00,
      "purchasePrice": 50.00
    }
  ],
  "receivedBy": "507f1f77bcf86cd799439014",
  "notes": "Partial receipt - rest coming next week"
}
```

**Response:**
```json
{
  "purchaseOrder": { ... },
  "batchesCreated": 1,
  "movementsCreated": 1,
  "isPartialReceipt": true
}
```

### PATCH /purchase-orders/:id/cancel
Cancel a purchase order (only if pending).

### DELETE /purchase-orders/:id
Delete a purchase order (only if pending, Super Admin only).

## Access Control

- **Create/Cancel**: Super Admin, Branch Manager
- **Receive**: Super Admin, Branch Manager, Pharmacist
- **Read**: Super Admin, Branch Manager, Pharmacist, Auditor
- **Delete**: Super Admin only

## Data Model

```typescript
{
  _id: ObjectId
  orderNumber: string (unique, indexed, format: PO-YYYYMMDD-{XXXX})
  supplierId: ObjectId (indexed)
  branchId: ObjectId (indexed)
  items: [
    {
      productId: ObjectId
      quantity: number
      unitPrice: number
      receivedQuantity: number
    }
  ]
  totalAmount: number
  status: 'pending' | 'partially_received' | 'completed' | 'cancelled' (indexed)
  expectedDeliveryDate: Date
  receivedAt?: Date
  createdBy: ObjectId
  notes?: string
  createdAt: Date
  updatedAt: Date
}
```

## Receiving Process

When a purchase order is received:

1. **Validation**: Verify PO status and received quantities
2. **Transaction Start**: Begin MongoDB transaction
3. **For each received item**:
   - Create a new batch with lot number and expiry date
   - Record a stock movement with type 'purchase'
   - Update received quantity in PO item
4. **Status Update**: 
   - Set to 'completed' if all items fully received
   - Set to 'partially_received' if some items pending
5. **Transaction Commit**: Commit all changes atomically

If any step fails, the entire transaction is rolled back.

## Order Number Generation

Order numbers are automatically generated in the format: `PO-YYYYMMDD-{XXXX}`
- `YYYYMMDD`: Current date
- `{XXXX}`: Sequential counter (padded to 4 digits)

Example: `PO-20240115-0001`
