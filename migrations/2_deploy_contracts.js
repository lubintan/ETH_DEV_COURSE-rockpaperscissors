// const ConvertLib = artifacts.require("ConvertLib");
const RockPaperScissors = artifacts.require("RockPaperScissors");

module.exports = function(deployer) {
  // deployer.deploy(ConvertLib);
  // deployer.link(ConvertLib, MetaCoin);
  deployer.deploy(RockPaperScissors);
};
