const tokenStorage = { token: null };
const activity = [];

const elements = {
  authStatus: document.querySelector('#auth-status'),
  authLabel: document.querySelector('#auth-label'),
  loginForm: document.querySelector('#login-form'),
  loginButton: document.querySelector('#login-button'),
  logoutButton: document.querySelector('#logout-button'),
  tokenCard: document.querySelector('#token-card'),
  tokenPreview: document.querySelector('#token-preview'),
  productForm: document.querySelector('#product-form'),
  productHint: document.querySelector('#product-hint'),
  unauthenticatedWriteButton: document.querySelector('#test-unauthenticated-write'),
  productsList: document.querySelector('#products-list'),
  ordersContent: document.querySelector('#orders-content'),
  activityList: document.querySelector('#activity-list'),
  activityCount: document.querySelector('#activity-count')
};

function setSignedIn(token) {
  tokenStorage.token = token;
  const signedIn = Boolean(token);
  elements.authStatus.classList.toggle('signed-in', signedIn);
  elements.authLabel.textContent = signedIn ? 'JWT ready' : 'Not signed in';
  elements.loginForm.classList.toggle('hidden', signedIn);
  elements.logoutButton.classList.toggle('hidden', !signedIn);
  elements.tokenCard.classList.toggle('hidden', !signedIn);
  elements.productHint.textContent = signedIn
    ? 'Token ready — product changes will be authorized by the gateway.'
    : 'Sign in below to enable product changes.';
  elements.tokenPreview.textContent = signedIn ? `${token.slice(0, 16)}…${token.slice(-8)}` : '';
}

function explainRoute(status, route, downstream) {
  if (status === 401) return 'Gateway rejected this request: a valid JWT is required.';
  if (status === 429) return 'Gateway rate limit reached: wait 10 seconds before trying again.';
  if (status >= 500) return 'The gateway could not complete this request. Check that the services are running.';
  if (downstream) return `Gateway forwarded this request to the ${downstream} service.`;
  return `Gateway returned HTTP ${status}.`;
}

function renderActivity() {
  elements.activityCount.textContent = `${activity.length} request${activity.length === 1 ? '' : 's'}`;
  if (!activity.length) {
    elements.activityList.innerHTML = '<div class="activity-empty"><span>⌁</span><strong>No requests yet</strong><small>Try one of the actions above to see the gateway work.</small></div>';
    return;
  }

  elements.activityList.innerHTML = activity.map(item => {
    const statusClass = item.status >= 200 && item.status < 300
      ? 's2xx'
      : item.status >= 400 && item.status < 500 ? 's4xx' : '';
    return `<div class="activity-row">
      <span class="status-code ${statusClass}">${item.status}</span>
      <span class="activity-route"><strong>${item.method}</strong>${item.path}</span>
      <span class="activity-message">${item.message}</span>
      <time class="activity-time">${item.time}</time>
    </div>`;
  }).join('');
}

function recordActivity(method, path, status, downstream) {
  activity.unshift({
    method,
    path,
    status,
    message: explainRoute(status, path, downstream),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
  activity.splice(25);
  renderActivity();
}

async function request(method, path, { body, authenticated = false, downstream, rateLimitClient = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authenticated && tokenStorage.token) headers.Authorization = `Bearer ${tokenStorage.token}`;
  if (rateLimitClient) headers.ClientId = 'gateway-lab-browser';

  try {
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch { data = text; }
    }
    recordActivity(method, path, response.status, downstream);
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    recordActivity(method, path, 0, downstream);
    throw new Error(`Could not reach the gateway at ${location.origin}. Is it running?`, { cause: error });
  }
}

function showHint(message, isError = false) {
  elements.productHint.textContent = message;
  elements.productHint.style.color = isError ? 'var(--red)' : '';
}

function renderProducts(products) {
  if (!Array.isArray(products) || products.length === 0) {
    elements.productsList.innerHTML = '<tr><td colspan="4" class="empty-state">No products yet. Create one after signing in.</td></tr>';
    return;
  }

  elements.productsList.innerHTML = products.map(product => `<tr>
    <td>${escapeHtml(product.name)}</td>
    <td>#${escapeHtml(product.id)}</td>
    <td>$${Number(product.price).toFixed(2)}</td>
    <td>${tokenStorage.token ? `<button class="table-action" data-delete-product="${Number(product.id)}">Delete</button>` : ''}</td>
  </tr>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

async function loadProducts() {
  const result = await request('GET', '/gateway/products', { downstream: 'Products' });
  if (result.ok) {
    renderProducts(result.data);
  } else {
    elements.productsList.innerHTML = `<tr><td colspan="4" class="empty-state">Could not load products (HTTP ${result.status}).</td></tr>`;
  }
}

async function loadOrders() {
  const result = await request('GET', '/gateway/orders', { authenticated: true, downstream: 'Orders' });
  if (!result.ok) {
    elements.ordersContent.classList.remove('loaded');
    elements.ordersContent.innerHTML = result.status === 401
      ? '<span class="lock-icon">⌑</span><span>401 — the gateway requires a valid JWT before it forwards this request.</span>'
      : `<span>Could not load orders (HTTP ${result.status}).</span>`;
    return;
  }

  elements.ordersContent.classList.add('loaded');
  elements.ordersContent.innerHTML = result.data.map(order => `<div class="order-row">
    <span><strong>${escapeHtml(order.product)}</strong> <small>× ${escapeHtml(order.qty)}</small></span>
    <small>ORDER #${escapeHtml(order.id)}</small>
  </div>`).join('');
}

elements.loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(elements.loginForm);
  elements.loginButton.disabled = true;
  elements.loginButton.textContent = 'Signing in…';
  try {
    const result = await request('POST', '/gateway/auth/login', {
      body: { username: form.get('username'), password: form.get('password') },
      downstream: 'Auth',
      rateLimitClient: true
    });
    if (result.ok && result.data?.token) {
      setSignedIn(result.data.token);
      await loadProducts();
    } else if (result.status === 429) {
      elements.authLabel.textContent = 'Rate limited — wait 10s';
    } else {
      elements.authLabel.textContent = `Login failed (${result.status})`;
    }
  } catch (error) {
    elements.authLabel.textContent = 'Gateway unavailable';
    window.alert(error.message);
  } finally {
    elements.loginButton.disabled = false;
    elements.loginButton.innerHTML = 'Sign in <span>→</span>';
  }
});

elements.logoutButton.addEventListener('click', () => {
  setSignedIn(null);
  renderProducts([]);
  showHint('Signed out. Try loading orders to see the gateway reject the request with 401.');
});

elements.productForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!tokenStorage.token) {
    showHint('Sign in first. The gateway will reject this write with 401 without a valid JWT.', true);
    return;
  }

  const form = new FormData(elements.productForm);
  const button = document.querySelector('#create-product-button');
  button.disabled = true;
  try {
    const result = await request('POST', '/gateway/products', {
      body: { name: form.get('name'), price: Number(form.get('price')) },
      authenticated: true,
      downstream: 'Products'
    });
    if (result.status === 201) {
      elements.productForm.reset();
      showHint(`Created “${result.data.name}” (ID ${result.data.id}). The gateway returned 201 Created.`);
      await loadProducts();
    } else if (result.status === 401) {
      showHint('401 — the gateway rejected this request. Sign in again to get a valid token.', true);
    } else {
      showHint(`Product creation returned HTTP ${result.status}.`, true);
    }
  } catch (error) {
    showHint(error.message, true);
  } finally {
    button.disabled = false;
  }
});

elements.unauthenticatedWriteButton.addEventListener('click', async () => {
  elements.unauthenticatedWriteButton.disabled = true;
  try {
    const result = await request('POST', '/gateway/products', {
      body: { name: 'Unauthenticated Test', price: 1 },
      downstream: 'Products'
    });
    if (result.status === 401) {
      showHint('401 — the gateway rejected this write before forwarding it to Products.', false);
    } else {
      showHint(`Expected 401, received HTTP ${result.status}. Check the gateway route configuration.`, true);
    }
  } catch (error) {
    showHint(error.message, true);
  } finally {
    elements.unauthenticatedWriteButton.disabled = false;
  }
});

elements.productsList.addEventListener('click', async event => {
  const button = event.target.closest('[data-delete-product]');
  if (!button) return;
  const productId = button.dataset.deleteProduct;
  button.disabled = true;
  try {
    const result = await request('DELETE', `/gateway/products/${productId}`, {
      authenticated: true,
      downstream: 'Products'
    });
    if (result.status === 204) {
      showHint(`Deleted product #${productId}. The gateway forwarded the authorized request.`);
      await loadProducts();
    } else {
      showHint(`Delete returned HTTP ${result.status}.`, true);
    }
  } catch (error) {
    showHint(error.message, true);
  }
});

document.querySelector('#refresh-products').addEventListener('click', () => loadProducts().catch(showError));
document.querySelector('#refresh-orders').addEventListener('click', () => loadOrders().catch(showError));
document.querySelector('#lesson-read').addEventListener('click', () => {
  document.querySelector('#products').scrollIntoView({ behavior: 'smooth', block: 'center' });
  loadProducts().catch(showError);
});
document.querySelector('#lesson-orders').addEventListener('click', () => {
  document.querySelector('#orders').scrollIntoView({ behavior: 'smooth', block: 'center' });
  loadOrders().catch(showError);
});
document.querySelector('#lesson-rate').addEventListener('click', async () => {
  if (!window.confirm('This test waits 11 seconds for a fresh rate-limit window, then sends six login requests quickly. The sixth should return 429. Continue?')) return;
  const button = document.querySelector('#lesson-rate');
  button.disabled = true;
  try {
    for (let seconds = 11; seconds > 0; seconds--) {
      button.textContent = `${seconds}s`;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    button.textContent = '…';
    const statuses = [];
    for (let index = 0; index < 6; index++) {
      try {
        const result = await request('POST', '/gateway/auth/login', {
          body: { username: 'demo', password: 'DemoPassword123!' },
          downstream: 'Auth',
          rateLimitClient: true
        });
        statuses.push(result.status);
      } catch (error) {
        showError(error);
        return;
      }
    }
    if (statuses.slice(0, 5).every(status => status === 200) && statuses[5] === 429) {
      window.alert('Rate-limit test passed: requests 1–5 returned 200, and request 6 returned 429. See Request activity for details.');
    } else {
      window.alert(`Observed login statuses: ${statuses.join(', ')}. See Request activity and wait for a fresh rate-limit window before retrying.`);
    }
  } finally {
    button.disabled = false;
    button.textContent = '↗';
  }
});
document.querySelector('#clear-activity').addEventListener('click', () => {
  activity.length = 0;
  renderActivity();
});

function showError(error) {
  showHint(error.message || 'The request failed.', true);
}

loadProducts().catch(error => {
  elements.productsList.innerHTML = '<tr><td colspan="4" class="empty-state">Gateway unavailable. Start all four services, then refresh.</td></tr>';
  showError(error);
});
