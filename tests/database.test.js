require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const bcrypt = require('bcryptjs');

class DatabaseTests {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 Running Database Tests...\n');
    
    await this.testDatabaseConnection();
    await this.testUserCreation();
    await this.testUserRetrieval();
    await this.testPasswordVerification();
    
    this.printResults();
  }

  async testDatabaseConnection() {
    console.log('📝 Test: Database Connection');
    try {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/abscobackend', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log('✅ Database Connection - Success');
      this.testResults.push({ test: 'Database Connection', status: 'PASS' });
    } catch (error) {
      console.log('❌ Database Connection - Failed:', error.message);
      this.testResults.push({ test: 'Database Connection', status: 'FAIL', error: error.message });
    }
  }

  async testUserCreation() {
    console.log('\n📝 Test: User Creation');
    try {
      // Check if test user already exists
      const existingUser = await User.findOne({ email: 'testuser@example.com' });
      if (existingUser) {
        console.log('⚠️ User Creation - Test user already exists (cleaning up)');
        await User.deleteOne({ email: 'testuser@example.com' });
      }
      
      // Create test user
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('testpassword123', salt);
      
      const newUser = new User({
        name: 'Test User',
        email: 'testuser@example.com',
        password: hashedPassword,
        role: 'user',
        isVerified: true
      });
      
      await newUser.save();
      console.log('✅ User Creation - Success');
      this.testResults.push({ test: 'User Creation', status: 'PASS', userId: newUser._id });
      
      // Clean up
      await User.deleteOne({ email: 'testuser@example.com' });
      
    } catch (error) {
      console.log('❌ User Creation - Failed:', error.message);
      this.testResults.push({ test: 'User Creation', status: 'FAIL', error: error.message });
    }
  }

  async testUserRetrieval() {
    console.log('\n📝 Test: User Retrieval');
    try {
      const user = await User.findOne({ email: 'Emmakanebi@gmail.com' });
      if (user) {
        console.log('✅ User Retrieval - Success');
        this.testResults.push({ 
          test: 'User Retrieval', 
          status: 'PASS', 
          data: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
          }
        });
      } else {
        console.log('❌ User Retrieval - User not found');
        this.testResults.push({ test: 'User Retrieval', status: 'FAIL', error: 'User not found' });
      }
    } catch (error) {
      console.log('❌ User Retrieval - Failed:', error.message);
      this.testResults.push({ test: 'User Retrieval', status: 'FAIL', error: error.message });
    }
  }

  async testPasswordVerification() {
    console.log('\n📝 Test: Password Verification');
    try {
      const user = await User.findOne({ email: 'Emmakanebi@gmail.com' });
      if (!user) {
        console.log('⚠️ Password Verification - Skipped (user not found)');
        this.testResults.push({ test: 'Password Verification', status: 'SKIP', reason: 'User not found' });
        return;
      }
      
      // Test correct password
      const correctMatch = await bcrypt.compare('Lancelot24@2024', user.password);
      if (correctMatch) {
        console.log('✅ Password Verification - Correct password works');
      } else {
        console.log('❌ Password Verification - Correct password failed');
        this.testResults.push({ test: 'Password Verification', status: 'FAIL', error: 'Correct password verification failed' });
        return;
      }
      
      // Test incorrect password
      const incorrectMatch = await bcrypt.compare('wrongpassword', user.password);
      if (!incorrectMatch) {
        console.log('✅ Password Verification - Incorrect password correctly rejected');
        this.testResults.push({ test: 'Password Verification', status: 'PASS' });
      } else {
        console.log('❌ Password Verification - Incorrect password incorrectly accepted');
        this.testResults.push({ test: 'Password Verification', status: 'FAIL', error: 'Incorrect password incorrectly accepted' });
      }
      
    } catch (error) {
      console.log('❌ Password Verification - Failed:', error.message);
      this.testResults.push({ test: 'Password Verification', status: 'FAIL', error: error.message });
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DATABASE TEST RESULTS');
    console.log('='.repeat(60));
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const skipped = this.testResults.filter(r => r.status === 'SKIP').length;
    
    this.testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${status} ${result.test}: ${result.status}`);
      if (result.error) console.log(`   Error: ${result.error}`);
      if (result.reason) console.log(`   Reason: ${result.reason}`);
      if (result.data) console.log(`   Data: ${JSON.stringify(result.data, null, 2)}`);
    });
    
    console.log('\n📈 SUMMARY:');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️ Skipped: ${skipped}`);
    console.log(`📊 Total: ${this.testResults.length}`);
    
    if (failed === 0) {
      console.log('\n🎉 All database tests passed!');
    } else {
      console.log('\n💡 Some database tests failed. Check the errors above.');
    }
  }

  async cleanup() {
    try {
      await mongoose.connection.close();
      console.log('\n🔌 Database connection closed');
    } catch (error) {
      console.log('⚠️ Error closing database connection:', error.message);
    }
  }
}

// Run tests
const dbTests = new DatabaseTests();
dbTests.runAllTests().then(() => {
  dbTests.cleanup();
}); 