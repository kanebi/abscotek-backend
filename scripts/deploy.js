const hre = require("hardhat");

async function main() {
  const Order = await hre.ethers.getContractFactory("Order");
  const order = await Order.deploy();

  await order.waitForDeployment();

  console.log(
    `Order contract deployed to ${order.target}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});