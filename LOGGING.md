# Logging System Documentation

## Overview

The AbscoBackend includes a comprehensive logging system that provides detailed request/response information for development and debugging purposes. The system uses Morgan for HTTP request logging and custom middleware for enhanced functionality.

## Features

### 🔍 **Detailed Request Logging**
- HTTP method, URL, and status codes
- Request headers (with sensitive data redacted)
- Request body content
- Query parameters and route parameters
- Response time and size
- User authentication information

### 🎨 **Color-Coded Output**
- **🔵 Blue**: GET requests
- **🟢 Green**: POST requests
- **🟡 Yellow**: PUT requests
- **🔴 Red**: DELETE requests and errors
- **🟣 Magenta**: User information
- **⚪ Gray**: Timestamps and metadata

### 📊 **Response Logging**
- Response status codes
- Response body content
- Response time tracking
- Response size in bytes

### 🛡️ **Security Features**
- Automatic redaction of sensitive headers (Authorization, x-auth-token)
- Safe handling of request/response bodies
- Error logging with stack traces

## Logging Components

### 1. **Morgan HTTP Logger**
- Custom tokens for request/response data
- Detailed and simple format options
- Color-coded output

### 2. **Request Logger Middleware**
- Logs request start with detailed information
- Captures request body, query params, and headers
- Tracks response time and size

### 3. **Response Body Capture**
- Captures response body for logging
- Handles JSON and text responses
- Safe error handling

### 4. **Error Logger**
- Comprehensive error logging
- Stack trace capture
- User context information

## Configuration

### Environment Variables
```env
NODE_ENV=development  # Enables detailed logging
PORT=5832            # Server port
```

### Development Mode
When `NODE_ENV=development`, the system enables:
- Detailed request/response logging
- Color-coded output
- Full request/response body capture
- Enhanced error logging

### Production Mode
When `NODE_ENV=production`, the system uses:
- Simplified logging format
- Reduced verbosity
- Performance-optimized logging

## Usage Examples

### Starting the Server
```bash
# Development mode with detailed logging
NODE_ENV=development npm start

# Production mode with standard logging
NODE_ENV=production npm start
```

### Testing the Logging System
```bash
# Run the logging test script
node test-logging.js
```

## Log Output Examples

### Request Log
```
=== REQUEST LOG ===
Timestamp: 2024-01-15T10:30:45.123Z
Method: POST
URL: /api/admin/signup
Status: 200
Response Time: 45ms
User: Anonymous

Headers: {
  "user-agent": "Mozilla/5.0...",
  "content-type": "application/json"
}

Request Body: {
  "name": "Test Admin",
  "email": "test@example.com",
  "password": "password123",
  "companyName": "Test Company",
  "phone": "1234567890"
}

Response Body: {
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "name": "Test Admin",
    "email": "test@example.com",
    "role": "admin"
  }
}
==================
```

### Error Log
```
=== ERROR LOG ===
Timestamp: 2024-01-15T10:30:45.123Z
Method: POST
URL: /api/admin/signup
Error: User already exists
Stack: Error: User already exists
    at /path/to/file.js:123:45
User: Anonymous
==================
```

## Customization

### Adding Custom Tokens
```javascript
// Add custom token to morgan
morgan.token('custom-token', (req) => {
  return req.customData || '';
});
```

### Custom Log Format
```javascript
const customFormat = (tokens, req, res) => {
  return `${tokens.method(req, res)} ${tokens.url(req, res)} ${tokens.status(req, res)}`;
};
```

### Filtering Sensitive Data
```javascript
// Add to morgan.token('headers')
const headers = {
  'authorization': req.get('Authorization') ? '[REDACTED]' : undefined,
  'x-auth-token': req.get('x-auth-token') ? '[REDACTED]' : undefined,
};
```

## Performance Considerations

### Development Mode
- Detailed logging may impact performance
- Use for debugging and development only
- Consider disabling for high-traffic testing

### Production Mode
- Optimized for performance
- Minimal logging overhead
- Essential information only

## Troubleshooting

### Common Issues

1. **No logs appearing**
   - Check if `NODE_ENV` is set correctly
   - Verify middleware order in server.js
   - Ensure console output is not redirected

2. **Sensitive data in logs**
   - Verify redaction tokens are working
   - Check custom header handling
   - Review request body logging

3. **Performance issues**
   - Switch to production mode
   - Reduce logging verbosity
   - Consider log rotation

### Debug Mode
```javascript
// Enable debug logging
process.env.DEBUG = 'morgan:*';
```

## Integration with Monitoring

### Log Aggregation
The logging system can be integrated with:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Splunk
- CloudWatch
- Custom monitoring solutions

### Metrics Collection
- Request count and response times
- Error rates and types
- User activity patterns
- API endpoint usage

## Best Practices

1. **Security**
   - Always redact sensitive information
   - Use environment-specific logging levels
   - Implement log rotation and retention

2. **Performance**
   - Use appropriate logging levels
   - Avoid logging in hot paths
   - Consider async logging for high-traffic scenarios

3. **Maintenance**
   - Regular log review and cleanup
   - Monitor log file sizes
   - Update logging configuration as needed

## API Endpoints for Logging

The logging system automatically logs all API endpoints:

- `/api/admin/*` - Admin authentication and management
- `/api/auth/*` - User authentication
- `/api/web3/*` - Web3 authentication
- `/api/users/*` - User management
- `/api/products/*` - Product management
- `/api/orders/*` - Order management
- `/api/cart/*` - Shopping cart
- `/api/wishlist/*` - User wishlist
- `/api/delivery-methods/*` - Delivery methods
- `/api/referrals/*` - Referral system

Each endpoint will show detailed request/response information in the console when the server is running in development mode. 