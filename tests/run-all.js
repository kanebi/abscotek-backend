const { spawn } = require('child_process');
const path = require('path');

class TestRunner {
  constructor() {
    this.testFiles = [
      'jwt.test.js',
      'database.test.js',
      'server.test.js',
      'auth.test.js'
    ];
    this.results = [];
  }

  async runAllTests() {
    console.log('🚀 Starting Test Suite...\n');
    console.log('='.repeat(60));
    console.log('🧪 ABSCO BACKEND TEST SUITE');
    console.log('='.repeat(60));
    console.log(`📅 Date: ${new Date().toISOString()}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('='.repeat(60) + '\n');

    for (const testFile of this.testFiles) {
      await this.runTest(testFile);
    }

    this.printFinalResults();
  }

  async runTest(testFile) {
    return new Promise((resolve) => {
      console.log(`\n📝 Running: ${testFile}`);
      console.log('-'.repeat(40));

      const testProcess = spawn('node', [path.join(__dirname, testFile)], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);
      });

      testProcess.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        process.stderr.write(text);
      });

      testProcess.on('close', (code) => {
        const result = {
          testFile,
          exitCode: code,
          output,
          errorOutput,
          success: code === 0
        };

        this.results.push(result);

        if (code === 0) {
          console.log(`\n✅ ${testFile} - Completed successfully`);
        } else {
          console.log(`\n❌ ${testFile} - Failed with exit code ${code}`);
        }

        resolve();
      });

      testProcess.on('error', (error) => {
        console.log(`\n💥 ${testFile} - Process error: ${error.message}`);
        this.results.push({
          testFile,
          exitCode: -1,
          output: '',
          errorOutput: error.message,
          success: false
        });
        resolve();
      });
    });
  }

  printFinalResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL TEST RESULTS');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;

    this.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.testFile}: ${result.success ? 'PASS' : 'FAIL'}`);
      if (!result.success && result.errorOutput) {
        console.log(`   Error: ${result.errorOutput.trim()}`);
      }
    });

    console.log('\n📈 OVERALL SUMMARY:');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${this.results.length}`);

    if (failed === 0) {
      console.log('\n🎉 All test suites passed!');
      console.log('🚀 Your backend is ready for production!');
    } else {
      console.log('\n💡 Some test suites failed. Please review the errors above.');
      console.log('🔧 Fix the issues before deploying to production.');
    }

    console.log('\n' + '='.repeat(60));
  }
}

// Run all tests
const testRunner = new TestRunner();
testRunner.runAllTests(); 