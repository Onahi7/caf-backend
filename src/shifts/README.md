# Shifts Module

This module handles shift management for cashiers at pharmacy branches.

## Features

- Open and close shifts with cash reconciliation
- Track opening and closing cash amounts
- Calculate expected cash and variance
- Validate that cashiers have open shifts before processing sales
- Branch-specific shift logs

## Requirements Implemented

- **7.1**: Shift opening with cashier, terminal, branch, opening time, and opening cash
- **7.2**: Shift closing with total sales calculation, expected cash, and variance
- **7.3**: Prevent sales without an open shift
- **7.4**: Prevent further sales on closed shifts
- **8.5**: Maintain separate shift logs for each branch

## API Endpoints

### POST /shifts/open
Open a new shift for a cashier.

**Request Body:**
```json
{
  "branchId": "string",
  "terminalId": "string",
  "cashierId": "string",
  "openingCash": 0
}
```

### POST /shifts/:id/close
Close a shift with cash reconciliation.

**Request Body:**
```json
{
  "closingCash": 0,
  "totalSales": 0,
  "notes": "string (optional)"
}
```

### GET /shifts?branchId={branchId}&cashierId={cashierId}&status={status}
Get all shifts with optional filtering.

**Query Parameters:**
- `branchId` (optional): Filter by branch ID
- `cashierId` (optional): Filter by cashier ID
- `status` (optional): Filter by status (open/closed)

### GET /shifts/branch/:branchId
Get all shifts for a specific branch.

### GET /shifts/cashier/:cashierId/open
Get the open shift for a specific cashier.

### GET /shifts/:id
Get a single shift by ID.

## Data Model

```typescript
{
  _id: ObjectId
  branchId: ObjectId (indexed)
  terminalId: string
  cashierId: ObjectId (indexed)
  openingCash: number
  closingCash?: number
  expectedCash?: number
  variance?: number
  status: 'open' | 'closed'
  openedAt: Date
  closedAt?: Date
  notes?: string
  createdAt: Date
  updatedAt: Date
}
```

## Cash Reconciliation

When closing a shift:
1. `expectedCash = openingCash + totalSales`
2. `variance = closingCash - expectedCash`

A positive variance means more cash than expected (overage).
A negative variance means less cash than expected (shortage).
