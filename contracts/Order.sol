// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Order {
    struct ProductItem {
        string productId;
        uint quantity;
        uint pricePerUnit;
    }

    enum OrderStatus { Created, Paid, Shipped, Delivered, Cancelled }

    struct OrderDetails {
        string orderId; // Link to backend order ID
        address buyer;
        address seller;
        uint totalAmount;
        ProductItem[] items;
        OrderStatus status;
        uint createdAt;
        uint paidAt;
    }

    mapping(string => OrderDetails) public orders;
    mapping(string => bool) public orderExists;

    event OrderCreated(string indexed orderId, address indexed buyer, address indexed seller, uint totalAmount);
    event OrderPaid(string indexed orderId, address indexed buyer, uint totalAmount);
    event OrderShipped(string indexed orderId, address indexed seller);
    event OrderDelivered(string indexed orderId, address indexed buyer);
    event OrderCancelled(string indexed orderId, address indexed canceller);

    function createOrder(
        string memory _orderId,
        address _buyer,
        address _seller,
        uint _totalAmount,
        ProductItem[] memory _items
    ) public {
        require(!orderExists[_orderId], "Order with this ID already exists.");

        OrderDetails storage newOrder = orders[_orderId];
        newOrder.orderId = _orderId;
        newOrder.buyer = _buyer;
        newOrder.seller = _seller;
        newOrder.totalAmount = _totalAmount;
        newOrder.status = OrderStatus.Created;
        newOrder.createdAt = block.timestamp;
        newOrder.paidAt = 0;

        for (uint i = 0; i < _items.length; i++) {
            newOrder.items.push(_items[i]);
        }

        orderExists[_orderId] = true;

        emit OrderCreated(_orderId, _buyer, _seller, _totalAmount);
    }

    function payOrder(string memory _orderId) public payable {
        OrderDetails storage order = orders[_orderId];
        require(orderExists[_orderId], "Order does not exist.");
        require(msg.sender == order.buyer, "Only the buyer can pay for the order.");
        require(order.status == OrderStatus.Created, "Order is not in Created status.");
        require(msg.value == order.totalAmount, "Incorrect payment amount.");

        order.status = OrderStatus.Paid;
        order.paidAt = block.timestamp;
        emit OrderPaid(_orderId, order.buyer, msg.value);
    }

    function shipOrder(string memory _orderId) public {
        OrderDetails storage order = orders[_orderId];
        require(orderExists[_orderId], "Order does not exist.");
        require(msg.sender == order.seller, "Only the seller can mark the order as shipped.");
        require(order.status == OrderStatus.Paid, "Order is not in Paid status.");

        order.status = OrderStatus.Shipped;
        emit OrderShipped(_orderId, order.seller);
    }

    function deliverOrder(string memory _orderId) public {
        OrderDetails storage order = orders[_orderId];
        require(orderExists[_orderId], "Order does not exist.");
        require(msg.sender == order.buyer, "Only the buyer can mark the order as delivered.");
        require(order.status == OrderStatus.Shipped, "Order is not in Shipped status.");

        order.status = OrderStatus.Delivered;
        // Transfer funds to seller (assuming seller is a payable address)
        payable(order.seller).transfer(order.totalAmount);
        emit OrderDelivered(_orderId, order.buyer);
    }

    function cancelOrder(string memory _orderId) public {
        OrderDetails storage order = orders[_orderId];
        require(orderExists[_orderId], "Order does not exist.");
        require(msg.sender == order.buyer || msg.sender == order.seller, "Only the buyer or seller can cancel the order.");
        require(order.status == OrderStatus.Created || order.status == OrderStatus.Paid, "Order cannot be cancelled at this stage.");

        order.status = OrderStatus.Cancelled;
        emit OrderCancelled(_orderId, msg.sender);
    }

    function getOrder(string memory _orderId) public view returns (
        string memory orderId,
        address buyer,
        address seller,
        uint totalAmount,
        ProductItem[] memory items,
        OrderStatus status,
        uint createdAt,
        uint paidAt
    ) {
        OrderDetails storage order = orders[_orderId];
        require(orderExists[_orderId], "Order does not exist.");
        return (
            order.orderId,
            order.buyer,
            order.seller,
            order.totalAmount,
            order.items,
            order.status,
            order.createdAt,
            order.paidAt
        );
    }
}