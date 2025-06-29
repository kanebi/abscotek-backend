// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ProductOrder {
    address public buyer;
    address public seller;
    uint public price;
    enum OrderStatus { Created, Paid, Shipped, Delivered, Cancelled }
    OrderStatus public status;

    event OrderCreated(address indexed buyer, address indexed seller, uint price);
    event OrderPaid(address indexed buyer, uint price);
    event OrderShipped(address indexed seller);
    event OrderDelivered(address indexed buyer);
    event OrderCancelled(address indexed canceller);

    constructor(address _buyer, address _seller, uint _price) {
        buyer = _buyer;
        seller = _seller;
        price = _price;
        status = OrderStatus.Created;
        emit OrderCreated(_buyer, _seller, _price);
    }

    function payOrder() public payable {
        require(msg.sender == buyer, "Only the buyer can pay for the order.");
        require(msg.value == price, "Incorrect payment amount.");
        status = OrderStatus.Paid;
        emit OrderPaid(buyer, msg.value);
    }

    function shipOrder() public {
        require(msg.sender == seller, "Only the seller can mark the order as shipped.");
        status = OrderStatus.Shipped;
        emit OrderShipped(seller);
    }

    function deliverOrder() public {
        require(msg.sender == buyer, "Only the buyer can mark the order as delivered.");
        status = OrderStatus.Delivered;
        emit OrderDelivered(buyer);
        payable(seller).transfer(price);
    }

    function cancelOrder() public {
        require(msg.sender == buyer || msg.sender == seller, "Only the buyer or seller can cancel the order.");
        status = OrderStatus.Cancelled;
        emit OrderCancelled(msg.sender);
    }
}
