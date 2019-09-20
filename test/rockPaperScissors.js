const truffleAssert = require('truffle-assertions');
const RockPaperScissors = artifacts.require("./RockPaperScissors.sol");
const bigNum = web3.utils.toBN;
// const seqPrm = require("./sequentialPromise.js");
const codeGen = require('./../app/js/codeGenerator.js');
const generator = codeGen.generator;


async function gasCost(txObj) {
    const gasUsed = bigNum(txObj.receipt.gasUsed);
    const txtx = await web3.eth.getTransaction(txObj.tx);
    const gasPrice = bigNum(txtx.gasPrice);

    return gasPrice.mul(gasUsed);
}

const timeTravel =  async function (duration) {
    await web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [duration], // 86400 is num seconds in day
        id: new Date().getTime()
        }, (err, result) => {
            if(err){ return err; }
            return result;
        }
    );
}

contract('RockPaperScissors', function(accounts){
    
    const [player1, player2, owner] = accounts;
    const [nothing, rock, paper, scissors, disallowed] = [0, 1, 2, 3, 4];
    let rpsCont, playPeriod, unlockPeriod;
    
    beforeEach("new contract deployment", async function() {
        rpsCont = await RockPaperScissors.new({ from: owner });
        playPeriod = bigNum(await rpsCont.playPeriod.call({ from: owner })).toNumber();
        unlockPeriod = bigNum(await rpsCont.unlockPeriod.call({ from: owner})).toNumber();
    });

    it ("Rejects ineligible move.", async function() {
        const initialDeposit = bigNum(web3.utils.toWei('10', "Gwei"));
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});
        
        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(web3.utils.toWei('0.5', "Gwei"));
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        
        // Check that cannot enrol more than initial deposit.
        await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet.add(initialDeposit), { from: player1 }));
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        await truffleAssert.fails(rpsCont.play(disallowed, { from: player2 }));
    });

    it ("Reverts when Player 2 plays with insufficient deposit.", async function() {
        const initialDepositP1 = bigNum(web3.utils.toWei('10', "Gwei"));
        const initialDepositP2 = bigNum(web3.utils.toWei('3', "Gwei"));
        await rpsCont.deposit({ from: player1, value: initialDepositP1});
        await rpsCont.deposit({ from: player2, value: initialDepositP2});
        
        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(web3.utils.toWei('5', "Gwei"));
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        
        // Check that cannot enrol more than initial deposit.
        await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet.add(initialDepositP1), { from: player1 }));
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        await truffleAssert.reverts(rpsCont.play(rock, { from: player2 }));
    });

    it ("Player 1 can cancel if no opponent shows up within play deadline.", async function() {
        const initialDeposit = bigNum(web3.utils.toWei('10', "Gwei"));
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        
        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(web3.utils.toWei('0.5', "Gwei"));
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });
        await timeTravel(playPeriod/2);

        // Check that cannot cancel before enrol deadline expiry.
        await truffleAssert.reverts(rpsCont.cancelNoOpponent({ from: player1 }));

        await timeTravel(playPeriod);

        const p1Before = bigNum(await rpsCont.getBalance({ from: player1 }));
        const txObjCancel = await rpsCont.cancelNoOpponent({ from: player1 });
        
        assert.strictEqual(txObjCancel.logs[0].event, 'LogCancelNoOpponent', 'Wrong event emitted.');
        assert.strictEqual(txObjCancel.logs[0].args.sender, player1, 'Cancel No Opponent Log Sender Error');

        const p1After = bigNum(await rpsCont.getBalance({ from: player1 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.sub(p1Bet).toString(10), "Player 1's expected contract balance incorrect.");

    });

    it ("Player 2 can claim bets if Player 1 does not unlock within unlock deadline.", async function() {
        const initialDeposit = bigNum(web3.utils.toWei('10', "Gwei"));
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(web3.utils.toWei('0.5', "Gwei"));
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, {from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        await rpsCont.play(rock, { from: player2 });
        await timeTravel(unlockPeriod/2);

        // Check that cannot cancel before play deadline expiry.
        await truffleAssert.reverts(rpsCont.cancelNoUnlock({ from: player2 }));
        await timeTravel(unlockPeriod);

        const p2Before = bigNum(await rpsCont.getBalance({ from: player2 }));
        const txObjCancel = await rpsCont.cancelNoUnlock({ from: player2 });
        
        assert.strictEqual(txObjCancel.logs[0].event, 'LogCancelNoUnlock', 'Wrong event emitted.');
        assert.strictEqual(txObjCancel.logs[0].args.sender, player2, 'Cancel No Unlock Log Sender Error');

        const p2After = bigNum(await rpsCont.getBalance({ from: player2 }));

        assert.strictEqual(p2Before.toString(10),
            p2After.sub(p1Bet).sub(p1Bet).toString(10), "Player 2's expected contract balance incorrect.");
    });

    it ("Funds moved correctly for game resulting in win-lose.", async function() {
        const initialDeposit = bigNum(web3.utils.toWei('10', "Gwei"));
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        const txObjDeposit = await rpsCont.deposit({ from: player2, value: initialDeposit});
        
        assert.strictEqual(txObjDeposit.logs[0].event, 'LogDeposit', 'Wrong event emitted.');
        assert.strictEqual(txObjDeposit.logs[0].args.sender, player2, 'Deposit Log Sender Error');
        assert.strictEqual(txObjDeposit.logs[0].args.amount.toString(10), initialDeposit.toString(10), 'Deposit Log Amount Error');

        const p1Before = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2Before = bigNum(await rpsCont.getBalance({ from: player2 }));

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(web3.utils.toWei('0.5', "Gwei"));
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        const txObjEnrol = await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        assert.strictEqual(txObjEnrol.logs[0].event, 'LogEnrol', 'Wrong event emitted.');
        assert.strictEqual(txObjEnrol.logs[0].args.sender, player1, 'Enrol Log Sender Error');
        assert.strictEqual(txObjEnrol.logs[0].args.bet.toString(10), p1Bet.toString(10), 'Enrol Log Bet Error');
        assert.strictEqual(txObjEnrol.logs[0].args.entryHash, p1Hash, 'Enrol Log Entry Hash Error');

        const txObjPlay = await rpsCont.play(paper, { from: player2 });

        assert.strictEqual(txObjPlay.logs[0].event, 'LogPlay', 'Wrong event emitted.');
        assert.strictEqual(txObjPlay.logs[0].args.sender, player2, 'Play Log Sender Error');
        assert.strictEqual(txObjPlay.logs[0].args.bet.toString(10), p1Bet.toString(10), 'Play Log Bet Error');
        assert.strictEqual(txObjPlay.logs[0].args.move.toNumber(), paper, 'Play Log Move Error');

        // Check that player 2 cannot unlock using player 1's code and move.
        await truffleAssert.reverts(rpsCont.unlock(p1Code, rock, { from: player2 }));

        // Check that player cannot change their submitted move.
        await truffleAssert.reverts(rpsCont.unlock(p1Code, paper, { from: player1 }));

        const txObjUnlock = await rpsCont.unlock(p1Code, rock, { from: player1 });

        assert.strictEqual(txObjUnlock.logs[0].event, 'LogUnlock', 'Wrong event emitted.');
        assert.strictEqual(txObjUnlock.logs[0].args.sender, player1, 'Unlock Log Sender Error');
        assert.strictEqual(txObjUnlock.logs[0].args.move.toNumber(), rock, 'Unlock Log Move Error');

        assert.strictEqual(txObjUnlock.logs[1].event, 'LogWinnerFound', 'Wrong event emitted.');
        assert.strictEqual(txObjUnlock.logs[1].args.winner, player2, 'Winner Found Log Winner Error');
        assert.strictEqual(txObjUnlock.logs[1].args.loser, player1, 'Winner Found Log Loser Error');
        assert.strictEqual(txObjUnlock.logs[1].args.amount.toString(10), p1Bet.toString(10), 'Winner Found Log Amount Error');

        const p1After = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2After = bigNum(await rpsCont.getBalance({ from: player2 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.add(p1Bet).toString(10), "Player 1's expected contract balance incorrect.");

        assert.strictEqual(p2Before.toString(10),
            p2After.sub(p1Bet).toString(10), "Player 2's expected contract balance incorrect.");

        // Winner can use earnings to place bigger bet.

        const newBet = initialDeposit.add(p1Bet);
        const p2Code = web3.utils.fromAscii(generator());
        const p2Hash = await rpsCont.hashIt.call(p2Code, paper, { from: player2 });

        await rpsCont.enrol(p2Hash, newBet, { from: player2 });
    });

    it ("Funds moved correctly for game resulting in draw.", async function() {
        const initialDeposit = bigNum(web3.utils.toWei('10', "Gwei"));
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Before = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2Before = bigNum(await rpsCont.getBalance({ from: player2 }));

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(web3.utils.toWei('0.5', "Gwei"));
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        await rpsCont.play(rock, { from: player2 });

        const p1Mid = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2Mid = bigNum(await rpsCont.getBalance({ from: player2 }));

        assert.strictEqual(p1Before.sub(p1Bet).toString(10),
            p1Mid.toString(10), "Player 1's expected contract balance incorrect.");

        assert.strictEqual(p2Before.sub(p1Bet).toString(10),
            p2Mid.toString(10), "Player 2's expected contract balance incorrect.");

        const txObjUnlock = await rpsCont.unlock(p1Code, rock, { from: player1 });

        assert.strictEqual(txObjUnlock.logs[0].event, 'LogUnlock', 'Wrong event emitted.');
        assert.strictEqual(txObjUnlock.logs[0].args.sender, player1, 'Unlock Log Sender Error');
        assert.strictEqual(txObjUnlock.logs[0].args.move.toNumber(), rock, 'Unlock Log Move Error');

        assert.strictEqual(txObjUnlock.logs[1].event, 'LogDrawGame', 'Wrong event emitted.');
        assert.strictEqual(txObjUnlock.logs[1].args.player1, player1, 'Draw Game Log Player 1 Error');
        assert.strictEqual(txObjUnlock.logs[1].args.player2, player2, 'Draw Game Log Player 2 Error');
        assert.strictEqual(txObjUnlock.logs[1].args.amount.toString(10), p1Bet.toString(10), 'Draw Game Log Amount Error');

        const p1After = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2After = bigNum(await rpsCont.getBalance({ from: player2 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.toString(10), "Player 1's final expected contract balance incorrect.");

        assert.strictEqual(p2Before.toString(10),
            p2After.toString(10), "Player 2's final expected contract balance incorrect.");
    });

    it ("Game in progress can run properly after pausing and unpausing", async function() {
        const initialDeposit = bigNum(web3.utils.toWei('10', "Gwei"));
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        let p1Before = bigNum(await rpsCont.getBalance({ from: player1 }));
        let p2Before = bigNum(await rpsCont.getBalance({ from: player2 }));

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(web3.utils.toWei('0.5', "Gwei"));
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        await rpsCont.pause({ from: owner });
        await timeTravel(playPeriod/2);
        await rpsCont.unpause({ from: owner });

        await rpsCont.play(paper, { from: player2 });

        await rpsCont.pause({ from: owner });
        await timeTravel(playPeriod/2);
        await rpsCont.unpause({ from: owner });

        await rpsCont.unlock(p1Code, rock, { from: player1 });

        const p1After = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2After = bigNum(await rpsCont.getBalance({ from: player2 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.add(p1Bet).toString(10), "Player 1's expected contract balance incorrect.");

        assert.strictEqual(p2Before.toString(10),
            p2After.sub(p1Bet).toString(10), "Player 2's expected contract balance incorrect.");

    });

    it ("Withdrawal works.", async function() {
        const initialDeposit = bigNum(web3.utils.toWei('10', "Gwei"));
        const withdrawAmount = bigNum(web3.utils.toWei('9', "Gwei"));
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        
        // Check that cannot withdraw greater than deposit.
        await truffleAssert.reverts(rpsCont.withdraw(initialDeposit.add(withdrawAmount, { from: player1 })));

        const player1Initial = bigNum(await web3.eth.getBalance(player1));
        const player1ContBef = await rpsCont.getBalance.call({ from: player1 });

        const txObjWithdraw = await rpsCont.withdraw(withdrawAmount, { from: player1 });

        assert.strictEqual(txObjWithdraw.logs[0].event, 'LogWithdraw', 'Wrong event emitted.');
        assert.strictEqual(txObjWithdraw.logs[0].args.sender, player1, 'Withdraw Log Sender Error');
        assert.strictEqual(txObjWithdraw.logs[0].args.amount.toString(10), withdrawAmount.toString(10), 'Withdraw Log Amont Error');

        const player1GasCost = await gasCost(txObjWithdraw);
        const player1Final = bigNum(await web3.eth.getBalance(player1));
        const player1ContAft = await rpsCont.getBalance.call({ from: player1 });

        assert.strictEqual(player1Initial.sub(player1GasCost).toString(10),
            player1Final.sub(withdrawAmount).toString(10), "Player's expected balance incorrect.");
        
        assert.strictEqual(player1ContBef.sub(withdrawAmount).toString(10),
            player1ContAft.toString(10), "Player's expected contract balance incorrect.");
    });

    it ("Cannot enrol with used-before hash.", async function() {
        const initialDeposit = bigNum(web3.utils.toWei('10', "Gwei"));
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(web3.utils.toWei('0.5', "Gwei"));
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        await rpsCont.play(paper, { from: player2 });
        await rpsCont.unlock(p1Code, rock, { from: player1 });

        await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet, { from: player1 }));
    });

    it ("Reverts killing when contract is not paused.", async function() {
        await truffleAssert.reverts(rpsCont.kill({ from: owner }));
    });

    it ("Reverts killing by non-pauser/owner.", async function() {
        await rpsCont.pause( {from: owner });
        await truffleAssert.reverts(rpsCont.kill({ from: player1 }));
    });

    it ("Reverts post-killing withdrawal by non-owner.", async function() {
        await rpsCont.pause( {from: owner });
        await rpsCont.kill( {from: owner });
        await truffleAssert.reverts(rpsCont.killedWithdrawal({ from: player1 }));
    });

    it ("Reverts post-killing withdrawal of 0 balance.", async function() {
        await rpsCont.pause({ from: owner });
        await rpsCont.kill({ from: owner });
        await truffleAssert.reverts(rpsCont.killedWithdrawal({ from: owner }));
    });

    it ("Post-killing withdrawal moves funds to the owner correctly.", async function() {
        const initialDeposit = bigNum(web3.utils.toWei('10', "Gwei"));
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(web3.utils.toWei('0.5', "Gwei"));
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        await rpsCont.play(paper, { from: player2 });
        await rpsCont.unlock(p1Code, rock, { from: player1 });

        await rpsCont.pause({ from: owner });
        await rpsCont.kill({ from: owner });
        
        const ownerBalBefore = bigNum(await web3.eth.getBalance(owner));
        const txObjKW = await rpsCont.killedWithdrawal({ from: owner });

        assert.strictEqual(txObjKW.logs[0].event, 'LogKilledWithdrawal', 'Wrong event emitted.');
        assert.strictEqual(txObjKW.logs[0].args.sender, owner, 'Killed Withdrawal Log Sender Error');
        assert.strictEqual(txObjKW.logs[0].args.amount.toString(10), initialDeposit.add(initialDeposit).toString(10), 'Killed Withdrawal Log Amount Error');

        const ownerGasCost = await gasCost(txObjKW);
        const ownerBalAfter = bigNum(await web3.eth.getBalance(owner));

        assert.strictEqual(ownerBalBefore.sub(ownerGasCost).toString(10),
            ownerBalAfter.sub(initialDeposit).sub(initialDeposit).toString(10), "Owner's expected balance incorrect.");
    });

    it ("Transfer Ownership sets owner to new owner.", async function() {
        const currentOwner = await rpsCont.getOwner.call({ from: owner });
        assert.strictEqual(currentOwner, owner, "Owner not as expected.");

        // Check that non-owner cannot transfer ownership.
        await truffleAssert.reverts(rpsCont.transferOwnership(player1, { from: player1 }));

        const txObjTransfer = await rpsCont.transferOwnership(player1, { from: owner });

        assert.strictEqual(txObjTransfer.logs[0].event, 'LogTransferOwnership', 'Wrong event emitted.');
        assert.strictEqual(txObjTransfer.logs[0].args.owner, owner, 'Transfer Ownership Log Old Owner Error');
        assert.strictEqual(txObjTransfer.logs[0].args.newOwner, player1, 'Transfer Ownership Log New Owner Error');

        assert.strictEqual(txObjTransfer.logs[1].event, 'PauserAdded', 'Wrong event emitted');
        assert.strictEqual(txObjTransfer.logs[1].args.account, player1, 'Pauser Log New Pauser Error');

        const newOwner = await rpsCont.getOwner.call({ from: owner });
        assert.strictEqual(newOwner, player1, "Ownership not transferred correctly.");
    });

    it ("Post-killing contract functions revert upon invocation.", async function() {
        const initialDeposit = bigNum(web3.utils.toWei('10', "Gwei"));
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});
        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(web3.utils.toWei('0.5', "Gwei"));
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        
        await rpsCont.pause({ from: owner });		
        await rpsCont.kill({ from: owner });
        await rpsCont.unpause({ from: owner });		

        await truffleAssert.reverts(rpsCont.deposit({ from: player1, value: initialDeposit }));
        await truffleAssert.reverts(rpsCont.getBalance({ from: player1 }));
        await truffleAssert.reverts(rpsCont.withdraw(initialDeposit, { from: player1 }));
        await truffleAssert.reverts(rpsCont.getCurrentBet({ from: player2 }));
        await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet, { from: player1 }));
        await truffleAssert.reverts(rpsCont.play(rock, { from: player2 }));
        await truffleAssert.reverts(rpsCont.unlock(p1Code, rock, { from: player1 }));
        await truffleAssert.reverts(rpsCont.transferOwnership(player1, { from: owner }));
        await truffleAssert.reverts(rpsCont.cancelNoUnlock({ from: player2 }));
        await truffleAssert.reverts(rpsCont.cancelNoOpponent({ from: player1 }));
        
    });


})