# Tests Directory

This directory contains comprehensive test suites for the AbscoBackend application.

## 📁 Test Files

### 🔐 `auth.test.js`
Tests authentication functionality including:
- Admin signup
- Admin login
- Admin profile access
- Invalid credentials handling

### 🗄️ `database.test.js`
Tests database connectivity and operations:
- Database connection
- User creation
- User retrieval
- Password verification

### 🌐 `server.test.js`
Tests server connectivity and endpoints:
- Server connectivity
- Root endpoint
- Admin endpoints
- API endpoints

### 🔑 `jwt.test.js`
Tests JWT functionality:
- JWT secret availability
- Token generation
- Token verification
- Token expiration
- Invalid token handling

### 🚀 `run-all.js`
Main test runner that executes all test suites and provides a comprehensive report.

## 🧪 Running Tests

### Run All Tests
```bash
npm test
# or
npm run test:all
```

### Run Individual Test Suites
```bash
# Authentication tests
npm run test:auth

# Database tests
npm run test:db

# Server tests
npm run test:server

# JWT tests
npm run test:jwt
```

### Run Tests Directly
```bash
# Run all tests
node tests/run-all.js

# Run individual test
node tests/auth.test.js
node tests/database.test.js
node tests/server.test.js
node tests/jwt.test.js
```

## 📊 Test Results

Each test suite provides detailed results including:
- ✅ Passed tests
- ❌ Failed tests
- ⚠️ Skipped tests
- 📈 Summary statistics
- 🔍 Detailed error messages

## 🔧 Test Configuration

### Environment Variables
Tests use the following environment variables:
- `NODE_ENV=test` - Sets test environment
- `MONGODB_URI` - Database connection string
- `JWT_SECRET` - JWT secret key

### Test Data
- Tests use isolated test data
- Database tests clean up after themselves
- Authentication tests use test credentials

## 🚨 Important Notes

1. **Server Required**: Server tests require the backend server to be running on port 5832
2. **Database Required**: Database tests require a MongoDB instance
3. **Environment Variables**: Ensure all required environment variables are set
4. **Test Isolation**: Each test suite runs independently

## 📝 Adding New Tests

To add new test files:

1. Create a new test file in the `tests/` directory
2. Follow the naming convention: `[feature].test.js`
3. Add the test file to the `testFiles` array in `run-all.js`
4. Add a corresponding npm script in `package.json`

### Test File Structure
```javascript
class FeatureTests {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    // Test methods here
    this.printResults();
  }

  printResults() {
    // Results output
  }
}

// Run tests
const tests = new FeatureTests();
tests.runAllTests();
```

## 🎯 Test Coverage

Current test coverage includes:
- ✅ Authentication system
- ✅ Database operations
- ✅ Server connectivity
- ✅ JWT functionality
- ✅ API endpoints
- ✅ Error handling

## 🔄 Continuous Integration

These tests can be integrated into CI/CD pipelines:
- GitHub Actions
- GitLab CI
- Jenkins
- CircleCI

## 📈 Performance

- Tests run sequentially to avoid conflicts
- Database tests include cleanup
- Server tests have timeouts
- JWT tests include expiration testing 