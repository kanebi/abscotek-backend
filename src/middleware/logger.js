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

// Custom format for detailed logging (now minimal to avoid noisy logs)
const detailedFormat = (tokens, req, res) => {
  const method = methodColor(tokens.method(req, res));
  const url = chalk.cyan(tokens.url(req, res));
  const status = statusColor(tokens.status(req, res));
  const responseTime = chalk.gray(`${tokens['response-time'](req, res)}ms`);
  const date = chalk.gray(new Date().toISOString());

  return `${date} ${method} ${url} ${status} ${responseTime}\n`;
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

// Request logger middleware (minimal: no body/headers/response dump)
const requestLogger = (req, res, next) => {
  const start = Date.now();

  console.log(chalk.blue(`REQ ${req.method} ${req.url}`));

  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    const status = res.statusCode;
    console.log(chalk.green(`RES ${status} ${req.method} ${req.url} - ${duration}ms`));
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