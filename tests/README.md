# Tests

This directory contains comprehensive tests for the Fantasy Football Draft App, with a focus on the CSV upload functionality and local value display features.

## Test Structure

### Test Files

- **`csvUpload.test.tsx`** - Integration tests for the CSV upload UI functionality
- **`csvParser.test.ts`** - Unit tests for CSV parsing logic and fuzzy matching
- **`localValueDisplay.test.tsx`** - Tests for displaying local values in parentheses
- **`setup.ts`** - Test environment setup

### Test Fixtures

The `fixtures/` directory contains test CSV files for different scenarios:

- **`valid-players.csv`** - CSV with players that exactly match host data
- **`invalid-players.csv`** - CSV with players that don't exist in host data
- **`fuzzy-match-players.csv`** - CSV with slightly misspelled player names (e.g., "AJ Brown" vs "A.J. Brown")
- **`missing-columns.csv`** - CSV missing required columns
- **`test-local-values.csv`** - Original test file with valid player data
- **`test-fuzzy-matching.csv`** - Original test file with fuzzy matching scenarios

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test

# Run tests once and exit
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Test Coverage

The tests cover the following functionality:

### CSV Upload Features
- ✅ Valid CSV file upload with exact player matches
- ✅ Invalid file type rejection (.txt, etc.)
- ✅ Missing required columns detection
- ✅ Empty CSV file handling
- ✅ Malformed data handling
- ✅ Position normalization (D/DST/D/ST → DEF, PK → K)

### Fuzzy Matching
- ✅ Suggestions for similar player names
- ✅ Multiple error handling
- ✅ Threshold-based matching (30% similarity)
- ✅ Case-insensitive matching

### Local Value Display
- ✅ Parenthetical display when values differ
- ✅ No parentheses when values match
- ✅ No parentheses when no local values set
- ✅ Decimal value formatting
- ✅ Zero value handling
- ✅ Large number handling

### Error Handling
- ✅ Detailed error messages with row numbers
- ✅ Suggestion-based error messages
- ✅ Multiple error aggregation
- ✅ File input clearing after processing

## Test Data

The test files use a subset of the actual player data from `src/data/mockData.ts` to ensure realistic testing scenarios. Key test players include:

- **Ja'Marr Chase** (WR, CIN) - Used for exact matching tests
- **A.J. Brown** (WR, PHI) - Used for fuzzy matching tests ("AJ Brown")
- **Christian McCaffrey** (RB, SF) - Used for various scenarios
- **Bijan Robinson** (RB, ATL) - Used for valid data tests

## Mocking Strategy

The tests use Vitest's mocking capabilities to:

- Mock the Firebase hook (`useFirebaseDraft`) to avoid database dependencies
- Mock file upload behavior using `@testing-library/user-event`
- Create controlled test environments for isolated feature testing

## Adding New Tests

When adding new CSV upload features or modifying existing behavior:

1. Add new test CSV files to `fixtures/` if needed
2. Update the relevant test files with new test cases
3. Ensure both unit tests (parsing logic) and integration tests (UI behavior) are covered
4. Update this README with new test coverage information

## Common Test Patterns

### File Upload Testing
```typescript
const file = createCSVFile(csvContent)
const fileInput = getFileInput()
await user.upload(fileInput, file)
```

### Error Message Testing
```typescript
await waitFor(() => {
  expect(screen.getByText(/error message pattern/i)).toBeInTheDocument()
})
```

### Local Value Display Testing
```typescript
expect(screen.getByText('$57')).toBeInTheDocument()
expect(screen.getByText('($60)')).toBeInTheDocument()
```
