# Products Module

## Overview

The Products module manages the global product catalog for the pharmacy POS system. Products are defined globally (not branch-specific) and include pharmaceutical items with their basic information, categorization, and regulatory flags.

## Key Features

- **Global Product Management**: Products are not associated with any specific branch
- **Unique Identifiers**: Each product has unique SKU and barcode
- **Search Functionality**: Search by name, SKU, or barcode with optional category/brand filters
- **Prescription Tracking**: Flag products that require prescriptions
- **Controlled Substances**: Mark controlled substances for regulatory compliance

## Schema

### Product
```typescript
{
  name: string              // Product name (indexed)
  sku: string              // Stock Keeping Unit (unique, indexed)
  barcode: string          // Barcode (unique, indexed)
  category: string         // Product category (indexed)
  brand: string            // Brand name
  unit: string             // Unit of measure (e.g., "Tablet", "Bottle")
  reorderLevel: number     // Minimum stock level before reorder
  requiresPrescription: boolean  // Requires prescription flag
  isControlled: boolean    // Controlled substance flag
  isActive: boolean        // Active status
  createdAt: Date
  updatedAt: Date
}
```

## API Endpoints

### Create Product
- **POST** `/products`
- **Roles**: Super Admin, Branch Manager, Pharmacist
- **Body**: CreateProductDto

### Get All Products
- **GET** `/products`
- **Roles**: All authenticated users
- **Returns**: Array of all products

### Get Active Products
- **GET** `/products/active`
- **Roles**: All authenticated users
- **Returns**: Array of active products only

### Search Products
- **GET** `/products/search?query={query}&category={category}&brand={brand}`
- **Roles**: All authenticated users
- **Query Params**:
  - `query` (required): Search term (searches name, SKU, barcode)
  - `category` (optional): Filter by category
  - `brand` (optional): Filter by brand

### Get Product by ID
- **GET** `/products/:id`
- **Roles**: All authenticated users

### Get Product by SKU
- **GET** `/products/sku/:sku`
- **Roles**: All authenticated users

### Get Product by Barcode
- **GET** `/products/barcode/:barcode`
- **Roles**: All authenticated users

### Get Products by Category
- **GET** `/products/category/:category`
- **Roles**: All authenticated users

### Get Products by Brand
- **GET** `/products/brand/:brand`
- **Roles**: All authenticated users

### Update Product
- **PATCH** `/products/:id`
- **Roles**: Super Admin, Branch Manager, Pharmacist
- **Body**: UpdateProductDto

### Delete Product
- **DELETE** `/products/:id`
- **Roles**: Super Admin only
- **Returns**: 204 No Content

### Deactivate Product
- **PATCH** `/products/:id/deactivate`
- **Roles**: Super Admin, Branch Manager
- **Returns**: Updated product with isActive = false

## Validation Rules

### Create Product
- All fields required except `requiresPrescription` and `isControlled`
- `reorderLevel` must be >= 0
- `sku` must be unique
- `barcode` must be unique

### Update Product
- All fields optional
- If updating `sku`, must remain unique
- If updating `barcode`, must remain unique
- `reorderLevel` must be >= 0 if provided

## Business Logic

### Duplicate Prevention
- System checks for existing SKU before creating/updating
- System checks for existing barcode before creating/updating
- Throws `ConflictException` if duplicate found

### Search Logic
- Searches across name, SKU, and barcode fields (case-insensitive)
- Can filter results by category and/or brand
- Returns empty array if no matches found

## Requirements Validation

This module validates the following requirements:

- **Requirement 1.1**: Products are created globally without branch association
- **Requirement 1.2**: Product updates apply globally to all branches
- **Requirement 1.4**: Products include all required fields (name, SKU, barcode, category, brand, unit, reorderLevel)
- **Requirement 1.5**: Products support pharmacy-specific flags (requiresPrescription, isControlled)
- **Requirement 6.2**: Products are searchable by name, SKU, and barcode

## Correctness Properties

This module implements the following correctness properties:

- **Property 1**: Products are globally scoped (no branchId field)
- **Property 2**: Product updates are global (same product data from any branch context)
- **Property 4**: Product structure completeness (all required fields present)
- **Property 22**: Product search multi-method (searchable by name, SKU, barcode)

## Usage Example

```typescript
// Create a product
const product = await productsService.create({
  name: 'Paracetamol 500mg',
  sku: 'PARA-500',
  barcode: '1234567890123',
  category: 'Pain Relief',
  brand: 'Generic',
  unit: 'Tablet',
  reorderLevel: 100,
  requiresPrescription: false,
  isControlled: false,
});

// Search for products
const results = await productsService.search({
  query: 'paracetamol',
  category: 'Pain Relief',
});

// Find by barcode (for POS scanning)
const product = await productsService.findByBarcode('1234567890123');
```

## Testing

Unit tests are provided in `products.service.spec.ts` covering:
- Product creation with duplicate validation
- Product retrieval by various methods
- Product search functionality
- Product updates with validation
- Error handling (NotFoundException, ConflictException)

## Dependencies

- **MongooseModule**: For MongoDB schema and model
- **AuthGuard**: JWT authentication
- **RolesGuard**: Role-based access control
- **class-validator**: DTO validation
- **class-transformer**: DTO transformation
