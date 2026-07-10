export const generateDeliveredEmail = (order) => {
  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.qty}</td>
        <td>₹${item.price * item.qty}</td>
      </tr>
    `
    )
    .join("");

  return `
  <div style="font-family:Arial;max-width:600px;margin:auto;">

    <img
      src="https://www.zusko.in/assets/zusko-CuTZ8EeH.png"
      alt="Zusko"
      style="height:50px;"
    />

    <h2>
      Your Order Has Been Delivered ❤️
    </h2>

    <p>
      Hi ${order.customerName},
    </p>

    <p>
      Thank you for choosing Zusko.
      Your order has been successfully delivered.
    </p>

    <p>
      <strong>Order ID:</strong>
      ${order.orderId}
    </p>

    <p>
      <strong>Total:</strong>
      ₹${order.total}
    </p>

    <table width="100%">
      <thead>
        <tr>
          <th align="left">Item</th>
          <th align="left">Qty</th>
          <th align="left">Amount</th>
        </tr>
      </thead>

      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <p>
      We hope you enjoyed our service.
      We look forward to serving you again.
    </p>

    <p>
      Regards,<br/>
      <strong>Team Zusko</strong>
    </p>

  </div>
  `;
};