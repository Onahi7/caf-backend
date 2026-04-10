#!/bin/bash

# Pharmacy POS API Endpoint Testing Script
# Usage: ./test-endpoints.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:3000/api"
TOKEN=""
BRANCH_ID=""
USER_ID=""
PRODUCT_ID=""
SHIFT_ID=""

echo "=========================================="
echo "Pharmacy POS API Endpoint Testing"
echo "=========================================="
echo ""

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3
    local data=$4
    
    echo -n "Testing: $description... "
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
    elif [ "$http_code" -ge 400 ] && [ "$http_code" -lt 500 ]; then
        echo -e "${YELLOW}⚠ WARN${NC} (HTTP $http_code)"
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
    fi
}

# 1. Authentication Tests
echo "1. AUTHENTICATION TESTS"
echo "----------------------------------------"

# Login
echo -n "Testing: Login... "
response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"admin123"}' \
    "$BASE_URL/auth/login")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
    TOKEN=$(echo "$body" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    echo "Token obtained: ${TOKEN:0:20}..."
else
    echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
    echo "Cannot proceed without authentication token"
    exit 1
fi

echo ""

# 2. User Management Tests
echo "2. USER MANAGEMENT TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/users" "Get all users"
echo ""

# 3. Branch Management Tests
echo "3. BRANCH MANAGEMENT TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/branches" "Get all branches"

# Get first branch ID for subsequent tests
response=$(curl -s -X GET \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/branches")
BRANCH_ID=$(echo "$response" | grep -o '"_id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "Using Branch ID: $BRANCH_ID"
echo ""

# 4. Product Management Tests
echo "4. PRODUCT MANAGEMENT TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/products?branchId=$BRANCH_ID" "Get all products"
test_endpoint "GET" "/products?search=test&branchId=$BRANCH_ID" "Search products"

# Get first product ID
response=$(curl -s -X GET \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/products?branchId=$BRANCH_ID")
PRODUCT_ID=$(echo "$response" | grep -o '"_id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "Using Product ID: $PRODUCT_ID"
echo ""

# 5. Inventory Tests
echo "5. INVENTORY TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/inventory?branchId=$BRANCH_ID" "Get inventory"
test_endpoint "GET" "/inventory/low-stock?branchId=$BRANCH_ID" "Get low stock items"
echo ""

# 6. Sales Tests
echo "6. SALES TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/sales?branchId=$BRANCH_ID" "Get all sales"
echo ""

# 7. Shift Management Tests
echo "7. SHIFT MANAGEMENT TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/shifts?branchId=$BRANCH_ID" "Get all shifts"
test_endpoint "GET" "/shifts/current?branchId=$BRANCH_ID&cashierId=$USER_ID&terminalId=TERMINAL-01" "Get current shift"
echo ""

# 8. Customer Tests
echo "8. CUSTOMER TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/customers?branchId=$BRANCH_ID" "Get all customers"
echo ""

# 9. Supplier Tests
echo "9. SUPPLIER TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/suppliers" "Get all suppliers"
echo ""

# 10. Purchase Order Tests
echo "10. PURCHASE ORDER TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/purchase-orders?branchId=$BRANCH_ID" "Get all purchase orders"
echo ""

# 11. Transfer Tests
echo "11. TRANSFER TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/transfers?branchId=$BRANCH_ID" "Get all transfers"
echo ""

# 12. Reports Tests
echo "12. REPORTS TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/reports/sales?branchId=$BRANCH_ID&startDate=2024-01-01&endDate=2024-12-31" "Sales report"
test_endpoint "GET" "/reports/inventory?branchId=$BRANCH_ID" "Inventory report"
test_endpoint "GET" "/reports/expiry?branchId=$BRANCH_ID&daysUntilExpiry=90" "Expiry report"
echo ""

# 13. Audit Log Tests
echo "13. AUDIT LOG TESTS"
echo "----------------------------------------"
test_endpoint "GET" "/audit" "Get audit logs"
echo ""

# 14. Health Check
echo "14. HEALTH CHECK"
echo "----------------------------------------"
test_endpoint "GET" "/health" "Health check"
echo ""

echo "=========================================="
echo "Testing Complete!"
echo "=========================================="
