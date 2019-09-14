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
    
    const [player1, player2, david] = accounts;
    const [rock, paper, scissors, disallowed] = [1, 2, 3, 4];
    let rpsCont, playPeriod, unlockPeriod;
    
    beforeEach("new contract deployment", async () => {
        rpsCont = await RockPaperScissors.new({ from: david });
        playPeriod = bigNum(await rpsCont.playPeriod.call({ from: david })).toNumber();
        unlockPeriod = bigNum(await rpsCont.unlockPeriod.call({ from: david})).toNumber();
    });

    it ("Rejects ineligible move.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});
        
        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        
        // Check that cannot enrol more than initial deposit.
        await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet.add(initialDeposit), { from: player1 }));
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        await truffleAssert.reverts(rpsCont.play(p2Bet, disallowed, { from: player2 }));
    });

    it ("Reverts when Player 2 plays with different bet.", async () => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});
        
        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        
        // Check that cannot enrol more than initial deposit.
        await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet.add(initialDeposit), { from: player1 }));
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 })).add(bigNum(5));
        await truffleAssert.reverts(rpsCont.play(p2Bet, rock, { from: player2 }));
    });

    it ("Player 1 can cancel if no opponent shows up within play deadline.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        
        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });
        await timeTravel(playPeriod/2);

        // Check that cannot cancel before enrol deadline expiry.
        await truffleAssert.reverts(rpsCont.cancelNoOpponent({ from: player1 }));

        await timeTravel(playPeriod);

        const p1Before = bigNum(await rpsCont.getBalance({ from: player1 }));
        const txObjCancel = await rpsCont.cancelNoOpponent({ from: player1 });
        
        await truffleAssert.eventEmitted(txObjCancel, 'LogCancelNoOpponent');
        assert.strictEqual(txObjCancel.logs[0].args.sender, player1, 'Cancel No Opponent Log Sender Error');       

        const p1After = bigNum(await rpsCont.getBalance({ from: player1 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.sub(p1Bet).toString(10), "Player 1's expected contract balance incorrect.");

    });

    it ("Player 2 can claim bets if Player 1 does not unlock within unlock deadline.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, {from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        await rpsCont.play(p2Bet, rock, { from: player2 });
        await timeTravel(unlockPeriod/2);

        // Check that cannot cancel before play deadline expiry.
        await truffleAssert.reverts(rpsCont.cancelNoUnlock({ from: player2 }));
        await timeTravel(unlockPeriod);

        const p2Before = bigNum(await rpsCont.getBalance({ from: player2 }));
        const txObjCancel = await rpsCont.cancelNoUnlock({ from: player2 });
        
        await truffleAssert.eventEmitted(txObjCancel, 'LogCancelNoUnlock');
        assert.strictEqual(txObjCancel.logs[0].args.sender, player2, 'Cancel No Unlock Log Sender Error');

        const p2After = bigNum(await rpsCont.getBalance({ from: player2 }));

        assert.strictEqual(p2Before.toString(10),
            p2After.sub(p1Bet).sub(p2Bet).toString(10), "Player 2's expected contract balance incorrect.");
    });

    it ("Funds moved correctly for game resulting in win-lose.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        const txObjDeposit = await rpsCont.deposit({ from: player2, value: initialDeposit});
        
        await truffleAssert.eventEmitted(txObjDeposit, 'LogDeposit');
        assert.strictEqual(txObjDeposit.logs[0].args.sender, player2, 'Deposit Log Sender Error');
        assert.strictEqual(txObjDeposit.logs[0].args.amount.toString(10), initialDeposit.toString(10), 'Deposit Log Amount Error');

        const p1Before = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2Before = bigNum(await rpsCont.getBalance({ from: player2 }));

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        const txObjEnrol = await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        await truffleAssert.eventEmitted(txObjEnrol, 'LogEnrol');
        assert.strictEqual(txObjEnrol.logs[0].args.sender, player1, 'Enrol Log Sender Error');
        assert.strictEqual(txObjEnrol.logs[0].args.bet.toString(10), p1Bet.toString(10), 'Enrol Log Bet Error');
        assert.strictEqual(txObjEnrol.logs[0].args.entryHash, p1Hash, 'Enrol Log Entry Hash Error');

        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        const txObjPlay = await rpsCont.play(p2Bet, paper, { from: player2 });

        await truffleAssert.eventEmitted(txObjPlay, 'LogPlay');
        assert.strictEqual(txObjPlay.logs[0].args.sender, player2, 'Play Log Sender Error');
        assert.strictEqual(txObjPlay.logs[0].args.bet.toString(10), p2Bet.toString(10), 'Play Log Bet Error');
        assert.strictEqual(txObjPlay.logs[0].args.move.toNumber(), paper, 'Play Log Move Error');

        // Check that player 2 cannot unlock using player 1's code and move.
        await truffleAssert.reverts(rpsCont.unlock(p1Code, rock, { from: player2 }));

        // Check that player cannot change their submitted move.
        await truffleAssert.reverts(rpsCont.unlock(p1Code, paper, { from: player1 }));

        const txObjUnlock = await rpsCont.unlock(p1Code, rock, { from: player1 });

        await truffleAssert.eventEmitted(txObjUnlock, 'LogUnlock');
        assert.strictEqual(txObjUnlock.logs[0].args.sender, player1, 'Unlock Log Sender Error');
        assert.strictEqual(txObjUnlock.logs[0].args.move.toNumber(), rock, 'Unlock Log Move Error');

        const p1After = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2After = bigNum(await rpsCont.getBalance({ from: player2 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.add(p1Bet).toString(10), "Player 1's expected contract balance incorrect.");

        assert.strictEqual(p2Before.toString(10),
            p2After.sub(p2Bet).toString(10), "Player 2's expected contract balance incorrect.");

        // Winner can use earnings to place bigger bet.

        const newBet = initialDeposit.add(p2Bet);
        const p2Code = web3.utils.fromAscii(generator());
        const p2Hash = await rpsCont.hashIt.call(p2Code, paper, { from: player2 });

        await rpsCont.enrol(p2Hash, newBet, { from: player2 });
    });

    it ("Funds moved correctly for game resulting in draw.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Before = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2Before = bigNum(await rpsCont.getBalance({ from: player2 }));

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        await rpsCont.play(p2Bet, rock, { from: player2 });

        const p1Mid = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2Mid = bigNum(await rpsCont.getBalance({ from: player2 }));

        assert.strictEqual(p1Before.sub(p1Bet).toString(10),
            p1Mid.toString(10), "Player 1's expected contract balance incorrect.");

        assert.strictEqual(p2Before.sub(p2Bet).toString(10),
            p2Mid.toString(10), "Player 2's expected contract balance incorrect.");

        await rpsCont.unlock(p1Code, rock, { from: player1 });

        const p1After = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2After = bigNum(await rpsCont.getBalance({ from: player2 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.toString(10), "Player 1's final expected contract balance incorrect.");

        assert.strictEqual(p2Before.toString(10),
            p2After.toString(10), "Player 2's final expected contract balance incorrect.");
    });

    it ("Game in progress can run properly after pausing and unpausing", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        let p1Before = bigNum(await rpsCont.getBalance({ from: player1 }));
        let p2Before = bigNum(await rpsCont.getBalance({ from: player2 }));

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        await rpsCont.pause({ from: david });
        await timeTravel(playPeriod/2);
        await rpsCont.unpause({ from: david });

        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        await rpsCont.play(p2Bet, paper, { from: player2 });

        await rpsCont.pause({ from: david });
        await timeTravel(playPeriod/2);
        await rpsCont.unpause({ from: david });

        await rpsCont.unlock(p1Code, rock, { from: player1 });

        const p1After = bigNum(await rpsCont.getBalance({ from: player1 }));
        const p2After = bigNum(await rpsCont.getBalance({ from: player2 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.add(p1Bet).toString(10), "Player 1's expected contract balance incorrect.");

        assert.strictEqual(p2Before.toString(10),
            p2After.sub(p2Bet).toString(10), "Player 2's expected contract balance incorrect.");

    });

    it ("Withdrawal works.", async() => {
        const initialDeposit = bigNum(1e10);
        const withdrawAmount = bigNum(9e9);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        
        // Check that cannot withdraw greater than deposit.
        await truffleAssert.reverts(rpsCont.withdraw(initialDeposit.add(withdrawAmount, { from: player1 })));

        const player1Initial = bigNum(await web3.eth.getBalance(player1));
        const player1ContBef = await rpsCont.getBalance.call({ from: player1 });

        const txObjWithdraw = await rpsCont.withdraw(withdrawAmount, { from: player1 });

        await truffleAssert.eventEmitted(txObjWithdraw, 'LogWithdraw');
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

    it ("Cannot enrol with used-before hash.", async () => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        await rpsCont.play(p2Bet, paper, { from: player2 });
        await rpsCont.unlock(p1Code, rock, { from: player1 });

        await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet, { from: player1 }));
    });

    it ("Reverts killing when contract is not paused.", async () => {
        await truffleAssert.reverts(rpsCont.kill({ from: david }));
    });

    it ("Reverts killing by non-pauser/owner.", async () => {
        await rpsCont.pause( {from: david });
        await truffleAssert.reverts(rpsCont.kill({ from: player1 }));
    });

    it ("Reverts post-killing withdrawal by non-owner.", async () => {
        await rpsCont.pause( {from: david });
        await rpsCont.kill( {from: david });
        await truffleAssert.reverts(rpsCont.killedWithdrawal({ from: player1 }));
    });

    it ("Reverts post-killing withdrawal of 0 balance.", async () => {
        await rpsCont.pause({ from: david });
        await rpsCont.kill({ from: david });
        await truffleAssert.reverts(rpsCont.killedWithdrawal({ from: david }));
    });

    it ("Post-killing withdrawal moves funds to the owner correctly.", async () => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        await rpsCont.play(p2Bet, paper, { from: player2 });
        await rpsCont.unlock(p1Code, rock, { from: player1 });

        await rpsCont.pause({ from: david });
        await rpsCont.kill({ from: david });
        
        const davidBalBefore = bigNum(await web3.eth.getBalance(david));
        const txObjKW = await rpsCont.killedWithdrawal({ from: david });

        await truffleAssert.eventEmitted(txObjKW, 'LogKilledWithdrawal');
        assert.strictEqual(txObjKW.logs[0].args.sender, david, 'Killed Withdrawal Log Sender Error');
        assert.strictEqual(txObjKW.logs[0].args.amount.toString(10), initialDeposit.add(initialDeposit).toString(10), 'Killed Withdrawal Log Amount Error');

        const davidGasCost = await gasCost(txObjKW);
        const davidBalAfter = bigNum(await web3.eth.getBalance(david));

        assert.strictEqual(davidBalBefore.sub(davidGasCost).toString(10),
            davidBalAfter.sub(initialDeposit).sub(initialDeposit).toString(10), "Owner's expected balance incorrect.");
    });

    it ("Post-killing contract functions revert upon invocation.", async () => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});
        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        
        await rpsCont.pause({ from: david });		
        await rpsCont.kill({ from: david });
        await rpsCont.unpause({ from: david });		

        await truffleAssert.reverts(rpsCont.deposit({ from: player1, value: initialDeposit }));
        await truffleAssert.reverts(rpsCont.getBalance({ from: player1 }));
        await truffleAssert.reverts(rpsCont.withdraw(initialDeposit, { from: player1 }));
        await truffleAssert.reverts(rpsCont.getCurrentBet({ from: player2 }));
        await truffleAssert.reverts(rpsCont.hashIt(p1Code, rock, { from: player1 }));
        await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet, { from: player1 }));
        await truffleAssert.reverts(rpsCont.play(p1Bet, rock, { from: player2 }));
        await truffleAssert.reverts(rpsCont.unlock(p1Code, rock, { from: player1 }));
        await truffleAssert.reverts(rpsCont.transferOwnership(player1, { from: david }));
        await truffleAssert.reverts(rpsCont.cancelNoUnlock({ from: player2 }));
        await truffleAssert.reverts(rpsCont.cancelNoOpponent({ from: player1 }));
        
    });


})