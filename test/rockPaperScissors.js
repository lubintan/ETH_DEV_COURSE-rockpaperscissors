const truffleAssert = require('truffle-assertions');
const RockPaperScissors = artifacts.require("./RockPaperScissors.sol");
const bigNum = web3.utils.toBN;
// const seqPrm = require("./sequentialPromise.js");
const codeGen = require('./../app/js/codeGenerator.js');
const generator = codeGen.generator;


async function gasCost(tx) {
    const gasUsed = bigNum(tx.receipt.gasUsed);
    const txtx = await web3.eth.getTransaction(tx.tx);
    const gasPrice = bigNum(txtx.gasPrice);

    return gasPrice.mul(gasUsed);
}

const timeTravel = function (time) {
    return new Promise((resolve, reject) => {
      web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [time], // 86400 is num seconds in day
        id: new Date().getTime()
      }, (err, result) => {
        if(err){ return reject(err) }
        return resolve(result)
      });
    })
  }

contract('RockPaperScissors', function(accounts){
    
    const [player1, player2, david] = accounts;
    let rpsCont, rock, paper, scissors, enrolPeriod, playPeriod;
    
    beforeEach("new contract deployment", async () => {
        rpsCont = await RockPaperScissors.new({ from: david });
        rock = await rpsCont.rock.call({ from: david });
        paper = await rpsCont.paper.call({ from: david });
        scissors = await rpsCont.scissors.call({ from: david });
        enrolPeriod = bigNum(await rpsCont.enrolPeriod.call({ from: david })).toNumber();
        playPeriod = bigNum(await rpsCont.playPeriod.call({ from: david})).toNumber();
    });

    it ("Reverts when Player 2 enrols with different bet.", async () => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});
        
        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        
        // Check that cannot enrol more than initial deposit.
        await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet.add(initialDeposit), { from: player1 }));
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 })).add(bigNum(5));
        const p2Hash = await rpsCont.hashIt.call(p2Code, rock, { from: player2 });

        await truffleAssert.reverts(rpsCont.enrol(p2Hash, p2Bet, { from: player2 }));

    });

    it ("Player 1 can cancel if no opponent shows up within enrol deadline.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        
        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });
        await timeTravel(enrolPeriod/2);

        // Check that cannot cancel before enrol deadline expiry.
        await truffleAssert.reverts(rpsCont.cancel_NoOpponent({ from: player1 }));

        await timeTravel(enrolPeriod);

        const p1Before = bigNum(await rpsCont.viewBalance({ from: player1 }));
        const tx = await rpsCont.cancel_NoOpponent({ from: player1 });
        await truffleAssert.eventEmitted(tx, 'LogCancel_NoOpponent');
        const p1After = bigNum(await rpsCont.viewBalance({ from: player1 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.sub(p1Bet).toString(10), "Player 1's expected contract balance incorrect.");

    });

    it ("Player 1 can claim bets if Player 2 does not play within play deadline.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, {from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        const p2Hash = await rpsCont.hashIt.call(p2Code, rock, { from: player2 });
        await rpsCont.enrol(p2Hash, p2Bet, { from: player2 });

        // Check that player 2 cannot play using player 1's code and move.
        await truffleAssert.reverts(rpsCont.play(p1Code, rock, { from: player2 }));

        // Check that player cannot change their submitted move.
        await truffleAssert.reverts(rpsCont.play(p1Code, paper, { from: player1 }));

        await rpsCont.play(p1Code, rock, { from: player1 });
        await timeTravel(playPeriod/2);

        // Check that cannot cancel before play deadline expiry.
        await truffleAssert.reverts(rpsCont.cancel_NoPlay({ from: player1 }));
        await timeTravel(playPeriod);

        const p1Before = bigNum(await rpsCont.viewBalance({ from: player1 }));
        const tx = await rpsCont.cancel_NoPlay({ from: player1 });
        await truffleAssert.eventEmitted(tx, 'LogCancel_NoPlay');
        const p1After = bigNum(await rpsCont.viewBalance({ from: player1 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.sub(p1Bet).sub(p2Bet).toString(10), "Player 1's expected contract balance incorrect.");
    });

    it ("Owner can claim bets if both players do not play within play deadline.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        const p2Hash = await rpsCont.hashIt.call(p2Code, rock, { from: player2 });
        await rpsCont.enrol(p2Hash, p2Bet, { from: player2 });
        await timeTravel(playPeriod * 2);

        const ownerBefore = bigNum(await rpsCont.viewBalance({ from: david }));
        await truffleAssert.reverts(rpsCont.cancel_Override({ from: player1 }));
        const tx  = await rpsCont.cancel_Override({ from: david });
        await truffleAssert.eventEmitted(tx, 'LogCancel_Override');
        const ownerAfter = bigNum(await rpsCont.viewBalance({ from: david }));

        assert.strictEqual(ownerBefore.toString(10),
            ownerAfter.sub(p1Bet).sub(p2Bet).toString(10), "Owner's expected contract balance incorrect.");

    });

    it ("Funds moved correctly for game resulting in win-lose.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        let tx = await rpsCont.deposit({ from: player2, value: initialDeposit});
        await truffleAssert.eventEmitted(tx, 'LogDeposit');

        let p1Before = bigNum(await rpsCont.viewBalance({ from: player1 }));
        let p2Before = bigNum(await rpsCont.viewBalance({ from: player2 }));

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        tx = await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });
        await truffleAssert.eventEmitted(tx, 'LogEnrol');

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        const p2Hash = await rpsCont.hashIt.call(p2Code, paper, { from: player2 });
        await rpsCont.enrol(p2Hash, p2Bet, { from: player2 });

        await rpsCont.play(p1Code, rock, { from: player1 });
        tx = await rpsCont.play(p2Code, paper, { from: player2 });
        await truffleAssert.eventEmitted(tx, 'LogPlay');

        const p1After = bigNum(await rpsCont.viewBalance({ from: player1 }));
        const p2After = bigNum(await rpsCont.viewBalance({ from: player2 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.add(p1Bet).toString(10), "Player 1's expected contract balance incorrect.");

        assert.strictEqual(p2Before.toString(10),
            p2After.sub(p2Bet).toString(10), "Player 2's expected contract balance incorrect.");

        // Winner can use earnings to place bigger bet.

        const p2Code2 = web3.utils.fromAscii(generator());
        const newBet = initialDeposit.add(p2Bet);
        const p2Hash2 = await rpsCont.hashIt.call(p2Code2, paper, { from: player2 });

        await rpsCont.enrol(p2Hash2, newBet, { from: player2 });
    });

    it ("Funds moved correctly for game resulting in draw.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        let p1Before = bigNum(await rpsCont.viewBalance({ from: player1 }));
        let p2Before = bigNum(await rpsCont.viewBalance({ from: player2 }));

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        const p2Hash = await rpsCont.hashIt.call(p2Code, rock, { from: player2 });
        await rpsCont.enrol(p2Hash, p2Bet, { from: player2 });

        await rpsCont.play(p1Code, rock, { from: player1 });
        await rpsCont.play(p2Code, rock, { from: player2 });

        const p1After = bigNum(await rpsCont.viewBalance({ from: player1 }));
        const p2After = bigNum(await rpsCont.viewBalance({ from: player2 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.toString(10), "Player 1's expected contract balance incorrect.");

        assert.strictEqual(p2Before.toString(10),
            p2After.toString(10), "Player 2's expected contract balance incorrect.");
    });

    it ("Game in progress can run properly after pausing and unpausing", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        let p1Before = bigNum(await rpsCont.viewBalance({ from: player1 }));
        let p2Before = bigNum(await rpsCont.viewBalance({ from: player2 }));

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        await rpsCont.pause({ from: david });
        await timeTravel(enrolPeriod/2);
        await rpsCont.unpause({ from: david });

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        const p2Hash = await rpsCont.hashIt.call(p2Code, paper, { from: player2 });
        await rpsCont.enrol(p2Hash, p2Bet, { from: player2 });

        await rpsCont.pause({ from: david });
        await timeTravel(enrolPeriod/2);
        await rpsCont.unpause({ from: david });

        await rpsCont.play(p1Code, rock, { from: player1 });

        await rpsCont.pause({ from: david });
        await timeTravel(playPeriod/2);
        await rpsCont.unpause({ from: david });

        await rpsCont.play(p2Code, paper, { from: player2 });

        const p1After = bigNum(await rpsCont.viewBalance({ from: player1 }));
        const p2After = bigNum(await rpsCont.viewBalance({ from: player2 }));

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
        const player1ContBef = await rpsCont.viewBalance.call({ from: player1 });

        tx = await rpsCont.withdraw(withdrawAmount, { from: player1 });
        await truffleAssert.eventEmitted(tx, 'LogWithdraw');

        const player1GasCost = await gasCost(tx);
        const player1Final = bigNum(await web3.eth.getBalance(player1));
        const player1ContAft = await rpsCont.viewBalance.call({ from: player1 });

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

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        const p2Hash = await rpsCont.hashIt.call(p2Code, paper, { from: player2 });
        await rpsCont.enrol(p2Hash, p2Bet, { from: player2 });

        await rpsCont.play(p1Code, rock, { from: player1 });
        await rpsCont.play(p2Code, paper, { from: player2 });

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

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        const p2Hash = await rpsCont.hashIt.call(p2Code, paper, { from: player2 });
        await rpsCont.enrol(p2Hash, p2Bet, { from: player2 });
        await rpsCont.play(p1Code, rock, { from: player1 });

        await rpsCont.pause({ from: david });
        await rpsCont.kill({ from: david });
        
        const davidBalBefore = bigNum(await web3.eth.getBalance(david));
        const tx = await rpsCont.killedWithdrawal({ from: david });	
        await truffleAssert.eventEmitted(tx, 'LogKilledWithdrawal');
        const davidGasCost = await gasCost(tx);
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
        await truffleAssert.reverts(rpsCont.viewBalance({ from: player1 }));
        await truffleAssert.reverts(rpsCont.withdraw(initialDeposit, { from: player1 }));
        await truffleAssert.reverts(rpsCont.getCurrentBet({ from: player2 }));
        await truffleAssert.reverts(rpsCont.hashIt(p1Code, rock, { from: player1 }));
        await truffleAssert.reverts(rpsCont.enrol(p1Hash, rock, { from: player1 }));
        await truffleAssert.reverts(rpsCont.play(p1Code, rock, { from: player1 }));
        await truffleAssert.reverts(rpsCont.transferOwnership(player1, { from: david }));
        await truffleAssert.reverts(rpsCont.cancel_Override({ from: david }));
        await truffleAssert.reverts(rpsCont.cancel_NoPlay({ from: player1 }));
        await truffleAssert.reverts(rpsCont.cancel_NoOpponent({ from: player1 }));
        
    });


})