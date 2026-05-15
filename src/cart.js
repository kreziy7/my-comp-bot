const carts = new Map();

function getCart(userId) {
  let c = carts.get(userId);
  if (!c) {
    c = new Map();
    carts.set(userId, c);
  }
  return c;
}

function addToCart(userId, productId, qty = 1) {
  const c = getCart(userId);
  c.set(productId, (c.get(productId) || 0) + qty);
}

function removeFromCart(userId, productId) {
  getCart(userId).delete(productId);
}

function clearCart(userId) {
  carts.delete(userId);
}

function getCartItems(userId) {
  return getCart(userId);
}

module.exports = { getCart, addToCart, removeFromCart, clearCart, getCartItems };
