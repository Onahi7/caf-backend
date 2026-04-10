# Suppliers Module

This module handles supplier management for the pharmacy POS system.

## Features

- Create, read, update, and delete suppliers
- Search suppliers by name
- Track supplier contact information and payment terms
- Soft delete (deactivate) suppliers
- Filter active/inactive suppliers

## Requirements

Implements requirements:
- 18.1: Supplier management with contact information and payment terms
- 18.2: Batch-supplier association
- 18.3: Supplier performance tracking
- 18.4: Purchase history per supplier
- 18.5: Multiple suppliers per product support

## Correctness Properties

Validates properties:
- **Property 68**: Supplier structure completeness - All suppliers contain required fields
- **Property 69**: Batch-supplier association - All batches reference valid suppliers
- **Property 70**: Multiple suppliers per product - Products can have batches from different suppliers

## API Endpoints

### POST /suppliers
Create a new supplier.

**Request Body:**
```json
{
  "name": "ABC Pharmaceuticals",
  "contactPerson": "John Doe",
  "phone": "+234-123-456-7890",
  "email": "contact@abcpharma.com",
  "address": "123 Main St, Lagos",
  "paymentTerms": "Net 30 days"
}
```

### GET /suppliers
Get all suppliers or filter by active status.

**Query Parameters:**
- `active` (optional): "true" to get only active suppliers

### GET /suppliers/search?name={name}
Search suppliers by name (case-insensitive).

**Query Parameters:**
- `name` (required): Supplier name to search for

### GET /suppliers/:id
Get a single supplier by ID.

### PATCH /suppliers/:id
Update a supplier.

### PATCH /suppliers/:id/deactivate
Deactivate a supplier (soft delete).

### DELETE /suppliers/:id
Delete a supplier permanently (Super Admin only).

## Access Control

- **Create/Update/Deactivate**: Super Admin, Branch Manager
- **Read**: Super Admin, Branch Manager, Pharmacist, Auditor
- **Delete**: Super Admin only

## Data Model

```typescript
{
  _id: ObjectId
  name: string (indexed)
  contactPerson: string
  phone: string
  email: string
  address: string
  paymentTerms: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
```
