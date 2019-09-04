const truffleAssert = require('truffle-assertions');
const RockPaperScissors = artifacts.require("./RockPaperScissors.sol");
const bigNum = web3.utils.toBN;
const seqPrm = require("./sequentialPromise.js");
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
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock);
        
        await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet.add(initialDeposit), { from: player1 }));
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 })).add(bigNum(5));
        const p2Hash = await rpsCont.hashIt.call(p2Code, rock);

        await truffleAssert.reverts(rpsCont.enrol(p2Hash, p2Bet, { from: player2 }));

    });

    it ("Player 1 can cancel if no opponent shows up within enrol deadline.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        
        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock);
        
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });
        await timeTravel(enrolPeriod/2);

        await truffleAssert.reverts(rpsCont.cancel_NoOpponent({ from: player1 }));

        await timeTravel(enrolPeriod);

        

        let p1Before = bigNum(await rpsCont.viewBalance({ from: player1 }));
        await rpsCont.cancel_NoOpponent({ from: player1 });
        let p1After = bigNum(await rpsCont.viewBalance({ from: player1 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.sub(p1Bet).toString(10), "Player 1's expected balance incorrect.");

    });

    it ("Player 1 can claim bets if Player 2 does not play within play deadline.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock);
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        const p2Hash = await rpsCont.hashIt.call(p2Code, rock);

        
        await rpsCont.enrol(p2Hash, p2Bet, { from: player2 });

        await truffleAssert.reverts(rpsCont.play(p1Code, rock, { from: player2 }));
        await truffleAssert.reverts(rpsCont.play(p1Code, paper, { from: player1 }));

        await rpsCont.play(p1Code, rock, { from: player1 });
        await timeTravel(playPeriod/2);
        await truffleAssert.reverts(rpsCont.cancel_NoPlay({ from: player1 }));
        await timeTravel(playPeriod);

        let p1Before = bigNum(await rpsCont.viewBalance({ from: player1 }));
        await rpsCont.cancel_NoPlay({ from: player1 });
        let p1After = bigNum(await rpsCont.viewBalance({ from: player1 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.sub(p1Bet).sub(p2Bet).toString(10), "Player 1's expected balance incorrect.");
    });

    it ("Owner can claim bets if both players do not play within play deadline.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock);
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        const p2Hash = await rpsCont.hashIt.call(p2Code, rock);
        
        await rpsCont.enrol(p2Hash, p2Bet, { from: player2 });
        await timeTravel(playPeriod * 2);

        let ownerBefore = bigNum(await rpsCont.viewBalance({ from: david }));
        await truffleAssert.reverts(rpsCont.cancel_Override({ from: player1 }));
        await rpsCont.cancel_Override({ from: david });
        let ownerAfter = bigNum(await rpsCont.viewBalance({ from: david }));

        assert.strictEqual(ownerBefore.toString(10),
            ownerAfter.sub(p1Bet).sub(p2Bet).toString(10), "Owner's expected balance incorrect.");

    });


    it ("Funds moved accurately based on game result.", async() => {
        const initialDeposit = bigNum(1e10);
        await rpsCont.deposit({ from: player1, value: initialDeposit});
        await rpsCont.deposit({ from: player2, value: initialDeposit});

        let p1Before = bigNum(await rpsCont.viewBalance({ from: player1 }));
        let p2Before = bigNum(await rpsCont.viewBalance({ from: player2 }));

        const p1Code = web3.utils.fromAscii(generator());
        const p1Bet = bigNum(5e8);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock);
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });

        const p2Code = web3.utils.fromAscii(generator());
        const p2Bet = bigNum(await rpsCont.getCurrentBet.call({ from: player2 }));
        const p2Hash = await rpsCont.hashIt.call(p2Code, paper);

        await rpsCont.enrol(p2Hash, p2Bet, { from: player2 });

        await rpsCont.play(p1Code, rock, { from: player1 });
        await rpsCont.play(p2Code, paper, { from: player2 });

        let p1After = bigNum(await rpsCont.viewBalance({ from: player1 }));
        let p2After = bigNum(await rpsCont.viewBalance({ from: player2 }));

        assert.strictEqual(p1Before.toString(10),
            p1After.add(p1Bet).toString(10), "Player 1's expected balance incorrect.");

        assert.strictEqual(p2Before.toString(10),
            p2After.sub(p2Bet).toString(10), "Player 2's expected balance incorrect.");

    });

})