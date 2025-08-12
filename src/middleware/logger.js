const morgan = require('morgan');
const chalk = require('chalk');

// Custom token for request body
morgan.token('body', (req) => {
  if (req.body && Object.keys(req.body).length > 0) {
    return JSON.stringify(req.body, null, 2);
  }
  return '';
});

// Custom token for response body
morgan.token('response-body', (req, res) => {
  if (res.locals.responseBody) {
    return JSON.stringify(res.locals.responseBody, null, 2);
  }
  return '';
});

// Custom token for user info
morgan.token('user', (req) => {
  if (req.user) {
    return `${req.user.name} (${req.user.role})`;
  }
  return 'Anonymous';
});

// Custom token for request headers
morgan.token('headers', (req) => {
  const headers = {
    'user-agent': req.get('User-Agent'),
    'content-type': req.get('Content-Type'),
    'authorization': req.get('Authorization') ? 'Bearer [REDACTED]' : undefined,
    'x-auth-token': req.get('x-auth-token') ? '[REDACTED]' : undefined,
    'x-wallet-address': req.get('x-wallet-address'),
    'x-user-email': req.get('x-user-email'),
  };
  
  // Remove undefined values
  Object.keys(headers).forEach(key => {
    if (headers[key] === undefined) {
      delete headers[key];
    }
  });
  
  return Object.keys(headers).length > 0 ? JSON.stringify(headers, null, 2) : '';
});

// Custom token for query parameters
morgan.token('query', (req) => {
  if (req.query && Object.keys(req.query).length > 0) {
    return JSON.stringify(req.query, null, 2);
  }
  return '';
});

// Custom token for params
morgan.token('params', (req) => {
  if (req.params && Object.keys(req.params).length > 0) {
    return JSON.stringify(req.params, null, 2);
  }
  return '';
});

// Color coding for status codes
const statusColor = (status) => {
  if (status >= 500) return chalk.red(status);
  if (status >= 400) return chalk.yellow(status);
  if (status >= 300) return chalk.cyan(status);
  if (status >= 200) return chalk.green(status);
  return chalk.gray(status);
};

// Color coding for methods
const methodColor = (method) => {
  switch (method) {
    case 'GET': return chalk.blue(method);
    case 'POST': return chalk.green(method);
    case 'PUT': return chalk.yellow(method);
    case 'DELETE': return chalk.red(method);
    case 'PATCH': return chalk.magenta(method);
    default: return chalk.gray(method);
  }
};

// Custom format for detailed logging
const detailedFormat = (tokens, req, res) => {
  const method = methodColor(tokens.method(req, res));
  const url = chalk.cyan(tokens.url(req, res));
  const status = statusColor(tokens.status(req, res));
  const responseTime = chalk.gray(`${tokens['response-time'](req, res)}ms`);
  const user = chalk.magenta(tokens.user(req, res));
  const date = chalk.gray(new Date().toISOString());
  
  let log = `\n${chalk.bold('=== REQUEST LOG ===')}\n`;
  log += `${chalk.bold('Timestamp:')} ${date}\n`;
  log += `${chalk.bold('Method:')} ${method}\n`;
  log += `${chalk.bold('URL:')} ${url}\n`;
  log += `${chalk.bold('Status:')} ${status}\n`;
  log += `${chalk.bold('Response Time:')} ${responseTime}\n`;
  log += `${chalk.bold('User:')} ${user}\n`;
  
  // Add query parameters if present
  const query = tokens.query(req, res);
  if (query) {
    log += `${chalk.bold('Query:')} ${chalk.gray(query)}\n`;
  }
  
  // Add params if present
  const params = tokens.params(req, res);
  if (params) {
    log += `${chalk.bold('Params:')} ${chalk.gray(params)}\n`;
  }
  
  // Add headers if present
  const headers = tokens.headers(req, res);
  if (headers) {
    log += `${chalk.bold('Headers:')} ${chalk.gray(headers)}\n`;
  }
  
  // Add request body if present
  const body = tokens.body(req, res);
  if (body) {
    log += `${chalk.bold('Request Body:')} ${chalk.gray(body)}\n`;
  }
  
  // Add response body if present
  const responseBody = tokens['response-body'](req, res);
  if (responseBody) {
    log += `${chalk.bold('Response Body:')} ${chalk.gray(responseBody)}\n`;
  }
  
  log += `${chalk.bold('==================')}\n`;
  
  return log;
};

// Simple format for production
const simpleFormat = (tokens, req, res) => {
  const method = methodColor(tokens.method(req, res));
  const url = chalk.cyan(tokens.url(req, res));
  const status = statusColor(tokens.status(req, res));
  const responseTime = chalk.gray(`${tokens['response-time'](req, res)}ms`);
  const user = chalk.magenta(tokens.user(req, res));
  
  return `${method} ${url} ${status} ${responseTime} - ${user}`;
};

// Middleware to capture response body
const captureResponseBody = (req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    try {
      res.locals.responseBody = JSON.parse(data);
    } catch (e) {
      res.locals.responseBody = data;
    }
    originalSend.call(this, data);
  };
  next();
};

// Development logger
const devLogger = morgan(detailedFormat, {
  stream: {
    write: (message) => {
      console.log(message);
    }
  }
});

// Production logger
const prodLogger = morgan(simpleFormat, {
  stream: {
    write: (message) => {
      console.log(message);
    }
  }
});

// Error logger
const errorLogger = (err, req, res, next) => {
  console.error(chalk.red.bold('=== ERROR LOG ==='));
  console.error(chalk.red(`Timestamp: ${new Date().toISOString()}`));
  console.error(chalk.red(`Method: ${req.method}`));
  console.error(chalk.red(`URL: ${req.url}`));
  console.error(chalk.red(`Error: ${err.message}`));
  console.error(chalk.red(`Stack: ${err.stack}`));
  console.error(chalk.red(`User: ${req.user ? `${req.user.name} (${req.user.role})` : 'Anonymous'}`));
  console.error(chalk.red('=================='));
  next(err);
};

// Request logger middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request start
  console.log(chalk.blue.bold(`\n=== REQUEST START ===`));
  console.log(chalk.blue(`Method: ${req.method}`));
  console.log(chalk.blue(`URL: ${req.url}`));
  console.log(chalk.blue(`IP: ${req.ip}`));
  console.log(chalk.blue(`User Agent: ${req.get('User-Agent')}`));
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(chalk.blue(`Body: ${JSON.stringify(req.body, null, 2)}`));
  }
  
  if (req.query && Object.keys(req.query).length > 0) {
    console.log(chalk.blue(`Query: ${JSON.stringify(req.query, null, 2)}`));
  }
  
  if (req.params && Object.keys(req.params).length > 0) {
    console.log(chalk.blue(`Params: ${JSON.stringify(req.params, null, 2)}`));
  }
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    const status = res.statusCode;
    
    console.log(chalk.green.bold(`\n=== RESPONSE END ===`));
    console.log(chalk.green(`Status: ${status}`));
    console.log(chalk.green(`Duration: ${duration}ms`));
    console.log(chalk.green(`Size: ${chunk ? chunk.length : 0} bytes`));
    
    if (chunk) {
      try {
        const responseBody = JSON.parse(chunk.toString());
        console.log(chalk.green(`Response: ${JSON.stringify(responseBody, null, 2)}`));
      } catch (e) {
        console.log(chalk.green(`Response: ${chunk.toString()}`));
      }
    }
    
    console.log(chalk.green('==================\n'));
    
    originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

module.exports = {
  devLogger,
  prodLogger,
  errorLogger,
  requestLogger,
  captureResponseBody,
  morgan
}; 