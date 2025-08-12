require('dotenv').config();
const jwt = require('jsonwebtoken');

class JWTTests {
  constructor() {
    this.testResults = [];
    this.jwtSecret = process.env.JWT_SECRET || 'supersecretjwttoken';
  }

  async runAllTests() {
    console.log('🧪 Running JWT Tests...\n');
    
    await this.testJWTSecretAvailability();
    await this.testTokenGeneration();
    await this.testTokenVerification();
    await this.testTokenExpiration();
    await this.testInvalidToken();
    
    this.printResults();
  }

  async testJWTSecretAvailability() {
    console.log('📝 Test: JWT Secret Availability');
    try {
      if (this.jwtSecret && this.jwtSecret.length > 0) {
        console.log('✅ JWT Secret - Available');
        this.testResults.push({ test: 'JWT Secret Availability', status: 'PASS' });
      } else {
        console.log('❌ JWT Secret - Not available');
        this.testResults.push({ test: 'JWT Secret Availability', status: 'FAIL', error: 'JWT secret is empty or undefined' });
      }
    } catch (error) {
      console.log('❌ JWT Secret - Failed:', error.message);
      this.testResults.push({ test: 'JWT Secret Availability', status: 'FAIL', error: error.message });
    }
  }

  async testTokenGeneration() {
    console.log('\n📝 Test: Token Generation');
    try {
      const payload = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          role: 'admin'
        }
      };
      
      const token = jwt.sign(payload, this.jwtSecret, { expiresIn: '24h' });
      
      if (token && token.length > 0) {
        console.log('✅ Token Generation - Success');
        this.testResults.push({ test: 'Token Generation', status: 'PASS', token: token.substring(0, 20) + '...' });
      } else {
        console.log('❌ Token Generation - Failed: Empty token');
        this.testResults.push({ test: 'Token Generation', status: 'FAIL', error: 'Generated token is empty' });
      }
    } catch (error) {
      console.log('❌ Token Generation - Failed:', error.message);
      this.testResults.push({ test: 'Token Generation', status: 'FAIL', error: error.message });
    }
  }

  async testTokenVerification() {
    console.log('\n📝 Test: Token Verification');
    try {
      const payload = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          role: 'admin'
        }
      };
      
      const token = jwt.sign(payload, this.jwtSecret, { expiresIn: '24h' });
      const decoded = jwt.verify(token, this.jwtSecret);
      
      if (decoded && decoded.user && decoded.user.id === payload.user.id) {
        console.log('✅ Token Verification - Success');
        this.testResults.push({ test: 'Token Verification', status: 'PASS', data: decoded.user });
      } else {
        console.log('❌ Token Verification - Failed: Invalid decoded data');
        this.testResults.push({ test: 'Token Verification', status: 'FAIL', error: 'Invalid decoded data' });
      }
    } catch (error) {
      console.log('❌ Token Verification - Failed:', error.message);
      this.testResults.push({ test: 'Token Verification', status: 'FAIL', error: error.message });
    }
  }

  async testTokenExpiration() {
    console.log('\n📝 Test: Token Expiration');
    try {
      const payload = {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          role: 'admin'
        }
      };
      
      // Create token that expires in 1 second
      const token = jwt.sign(payload, this.jwtSecret, { expiresIn: '1s' });
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      try {
        jwt.verify(token, this.jwtSecret);
        console.log('❌ Token Expiration - Failed: Token should have expired');
        this.testResults.push({ test: 'Token Expiration', status: 'FAIL', error: 'Token did not expire' });
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          console.log('✅ Token Expiration - Success');
          this.testResults.push({ test: 'Token Expiration', status: 'PASS' });
        } else {
          console.log('❌ Token Expiration - Unexpected error:', error.message);
          this.testResults.push({ test: 'Token Expiration', status: 'FAIL', error: error.message });
        }
      }
    } catch (error) {
      console.log('❌ Token Expiration - Failed:', error.message);
      this.testResults.push({ test: 'Token Expiration', status: 'FAIL', error: error.message });
    }
  }

  async testInvalidToken() {
    console.log('\n📝 Test: Invalid Token');
    try {
      const invalidToken = 'invalid.token.here';
      
      try {
        jwt.verify(invalidToken, this.jwtSecret);
        console.log('❌ Invalid Token - Failed: Should have rejected invalid token');
        this.testResults.push({ test: 'Invalid Token', status: 'FAIL', error: 'Invalid token was accepted' });
      } catch (error) {
        if (error.name === 'JsonWebTokenError') {
          console.log('✅ Invalid Token - Success');
          this.testResults.push({ test: 'Invalid Token', status: 'PASS' });
        } else {
          console.log('❌ Invalid Token - Unexpected error:', error.message);
          this.testResults.push({ test: 'Invalid Token', status: 'FAIL', error: error.message });
        }
      }
    } catch (error) {
      console.log('❌ Invalid Token - Failed:', error.message);
      this.testResults.push({ test: 'Invalid Token', status: 'FAIL', error: error.message });
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 JWT TEST RESULTS');
    console.log('='.repeat(60));
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    
    this.testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${status} ${result.test}: ${result.status}`);
      if (result.error) console.log(`   Error: ${result.error}`);
      if (result.data) console.log(`   Data: ${JSON.stringify(result.data, null, 2)}`);
      if (result.token) console.log(`   Token: ${result.token}`);
    });
    
    console.log('\n📈 SUMMARY:');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${this.testResults.length}`);
    
    if (failed === 0) {
      console.log('\n🎉 All JWT tests passed!');
    } else {
      console.log('\n💡 Some JWT tests failed. Check the errors above.');
    }
  }
}

// Run tests
const jwtTests = new JWTTests();
jwtTests.runAllTests(); 