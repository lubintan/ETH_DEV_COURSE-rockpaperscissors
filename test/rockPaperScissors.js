const { toBN, toWei, fromAscii } = web3.utils;
const truffleAssert = require('truffle-assertions');
const RockPaperScissors = artifacts.require("./RockPaperScissors.sol");
const codeGen = require('./../app/js/codeGenerator.js');
const generator = codeGen.generator;


async function gasCost(txObj) {
    const gasUsed = toBN(txObj.receipt.gasUsed);
    const txtx = await web3.eth.getTransaction(txObj.tx);
    const gasPrice = toBN(txtx.gasPrice);

    return gasPrice.mul(gasUsed);
}

function gasUsed(txObj) {
    return toBN(txObj.receipt.gasUsed);
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
    
    const [player1, player2, player3, player4, owner] = accounts;
    const [nothing, rock, paper, scissors, disallowed, disallowedBig] = [0, 1, 2, 3, 4, 948896921];
    const [notInPlay, waitingForJoin, waitingForPlay, waitingForUnlock, gameCompleted] = [0, 1, 2, 3, 4];
    const initialDeposit = toBN(toWei('10', 'Gwei'));
    const p1Code = fromAscii(generator());
    const p1Bet = toBN(toWei('0.5', 'Gwei'));
    let rpsCont, joinPeriod, playPeriod, unlockPeriod;
    
    beforeEach("new contract deployment", async function() {
        rpsCont = await RockPaperScissors.new({ from: owner });
        joinPeriod = toBN(await rpsCont.joinPeriod.call({ from: owner })).toNumber();
        playPeriod = toBN(await rpsCont.playPeriod.call({ from: owner })).toNumber();
        unlockPeriod = toBN(await rpsCont.unlockPeriod.call({ from: owner})).toNumber();
    });

    describe( "Tests beginning with enrollment by player 1.", function(){
        let p1Hash;

        beforeEach("post-deployment setup", async function() {    
            p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
            await rpsCont.enrol(p1Hash, p1Bet, { from: player1, value: p1Bet });
        });

        it ("Rejects ineligible move.", async function() {            
            await rpsCont.join(p1Hash, { from: player2, value: p1Bet });
    
            await truffleAssert.reverts(rpsCont.play(p1Hash, nothing, { from: player2 }));
            await truffleAssert.fails(rpsCont.play(p1Hash, disallowed, { from: player2 }));
            await truffleAssert.fails(rpsCont.play(p1Hash, disallowedBig, { from: player2 }));
        });

        it ("Reverts when Player 2 joins with insufficient payment.", async function() {
            const p2BetSmall = toBN(toWei('0.4', 'Gwei'));    
            await truffleAssert.reverts(rpsCont.join(p1Hash, { from: player2, value: p2BetSmall }));
        });

        it ("Player 1 can cancel if no opponent shows up within join deadline.", async function() {            
            await timeTravel(joinPeriod/2);
    
            // Check that cannot cancel before join deadline expiry.
            await truffleAssert.reverts(rpsCont.cancelNoJoin(p1Hash, { from: player1 }));
    
            await timeTravel(joinPeriod);
    
            const p1Before = await rpsCont.balances.call(player1, { from: player1 });
            const txObjCancel = await rpsCont.cancelNoJoin(p1Hash, { from: player1 });
    
            const cancelEvent = txObjCancel.logs[0];        
            assert.strictEqual(cancelEvent.event, 'LogCancelNoJoin', 'Wrong event emitted.');
            assert.strictEqual(cancelEvent.args.entryHash, p1Hash, 'Wrong game entryHash.');
            assert.strictEqual(cancelEvent.args.sender, player1, 'Cancel No Join Log Sender Error');
    
            const p1After = await rpsCont.balances.call(player1, { from: player1 });
    
            assert.strictEqual(p1Before.toString(10),
                p1After.sub(p1Bet).toString(10), "Player 1's expected contract balance incorrect.");
    
        });

        it ("Player 1 can cancel if Player 2 does not play within play deadline.", async function() {            
            await rpsCont.join(p1Hash, { from: player2, value: p1Bet });
            await timeTravel(playPeriod/2);
    
            // Check that cannot cancel before play deadline expiry.
            await truffleAssert.reverts(rpsCont.cancelNoPlay(p1Hash, { from: player1 }));
    
            await timeTravel(playPeriod);
    
            const p1Before = await rpsCont.balances.call(player1, { from: player1 });
            const txObjCancel = await rpsCont.cancelNoPlay(p1Hash, { from: player1 });
    
            const cancelEvent = txObjCancel.logs[0];
            assert.strictEqual(cancelEvent.event, 'LogCancelNoPlay', 'Wrong event emitted.');
            assert.strictEqual(cancelEvent.args.entryHash, p1Hash, 'Wrong game entryHash.');
            assert.strictEqual(cancelEvent.args.sender, player1, 'Cancel No Play Log Sender Error');
    
            const p1After = await rpsCont.balances.call(player1, { from: player1 });
    
            assert.strictEqual(p1Before.toString(10),
                p1After.sub(p1Bet).sub(p1Bet).toString(10), "Player 1's expected contract balance incorrect.");
    
        });
    
        it ("Player 2 can claim bets if Player 1 does not unlock within unlock deadline.", async function() {
            await rpsCont.join(p1Hash, { from: player2, value: p1Bet  });    
            await rpsCont.play(p1Hash, rock, { from: player2 });
            await timeTravel(unlockPeriod/2);
    
            // Check that cannot cancel before unlock deadline expiry.
            await truffleAssert.reverts(rpsCont.cancelNoUnlock(p1Hash, { from: player2 }));

            await timeTravel(unlockPeriod);

            const p2Before = await rpsCont.balances.call(player2, { from: player2 });
            const txObjCancel = await rpsCont.cancelNoUnlock(p1Hash, { from: player2 });
            
            const cancelEvent = txObjCancel.logs[0];
            assert.strictEqual(cancelEvent.event, 'LogCancelNoUnlock', 'Wrong event emitted.');
            assert.strictEqual(cancelEvent.args.entryHash, p1Hash, 'Wrong game entryHash.');
            assert.strictEqual(cancelEvent.args.sender, player2, 'Cancel No Unlock Log Sender Error');
    
            const p2After = await rpsCont.balances.call(player2, { from: player2 });
    
            assert.strictEqual(p2Before.toString(10),
                p2After.sub(p1Bet).sub(p1Bet).toString(10), "Player 2's expected contract balance incorrect.");
        });
    
        it ("Funds moved correctly for game resulting in draw.", async function() {    
            await rpsCont.join(p1Hash, { from: player2 , value: p1Bet });
            await rpsCont.play(p1Hash, rock, { from: player2 });

            const p1Before = await rpsCont.balances.call(player1, { from: player1 });
            const p2Before = await rpsCont.balances.call(player2, { from: player2 });
    
            const txObjUnlock = await rpsCont.unlock(p1Hash, p1Code, rock, { from: player1 });
    
            const unlockEvent = txObjUnlock.logs[0];
            assert.strictEqual(unlockEvent.event, 'LogUnlock', 'Wrong event emitted.');
            assert.strictEqual(unlockEvent.args.entryHash, p1Hash, 'Wrong game entryHash.');
            assert.strictEqual(unlockEvent.args.sender, player1, 'Unlock Log Sender Error');
            assert.strictEqual(unlockEvent.args.move.toNumber(), rock, 'Unlock Log Move Error')
    
            const unlockEvent2 = txObjUnlock.logs[1];
            assert.strictEqual(unlockEvent2.event, 'LogDrawGame', 'Wrong event emitted.');
            assert.strictEqual(unlockEvent2.args.entryHash, p1Hash, 'Wrong game entryHash.');
            assert.strictEqual(unlockEvent2.args.player1, player1, 'Draw Game Log Player 1 Error');
            assert.strictEqual(unlockEvent2.args.player2, player2, 'Draw Game Log Player 2 Error');
            assert.strictEqual(unlockEvent2.args.amount.toString(10), p1Bet.toString(10), 'Draw Game Log Amount Error');
    
            const p1After = await rpsCont.balances.call(player1, { from: player1 });
            const p2After = await rpsCont.balances.call(player2, { from: player2 });
    
            assert.strictEqual(p1Before.toString(10),
                p1After.sub(p1Bet).toString(10), "Player 1's final expected contract balance incorrect.");
    
            assert.strictEqual(p2Before.toString(10),
                p2After.sub(p1Bet).toString(10), "Player 2's final expected contract balance incorrect.");
        });

        it ("Game in progress can run properly after pausing and unpausing", async function() {                
            const p1Before = await rpsCont.balances.call(player1, { from: player1 });
            const p2Before = await rpsCont.balances.call(player2, { from: player2 });
    
            await rpsCont.pause({ from: owner });
            await timeTravel(playPeriod/2);
            await rpsCont.unpause({ from: owner });
    
            await rpsCont.join(p1Hash, { from: player2 , value: p1Bet });

            await rpsCont.pause({ from: owner });
            await timeTravel(playPeriod/2);
            await rpsCont.unpause({ from: owner });

            await rpsCont.play(p1Hash, paper, { from: player2 });
    
            await rpsCont.pause({ from: owner });
            await timeTravel(playPeriod/2);
            await rpsCont.unpause({ from: owner });
    
            await rpsCont.unlock(p1Hash, p1Code, rock, { from: player1 });
    
            const p1After = await rpsCont.balances.call(player1, { from: player1 });
            const p2After = await rpsCont.balances.call(player2, { from: player2 });
    
            assert.strictEqual(p1Before.toString(10),
                p1After.toString(10), "Player 1's expected contract balance incorrect.");
    
            assert.strictEqual(p2Before.toString(10),
                p2After.sub(p1Bet.mul(toBN(2))).toString(10), "Player 2's expected contract balance incorrect.");
    
        });
    
        it ("Withdrawal works.", async function() {
            await rpsCont.join(p1Hash, { from: player2, value: p1Bet.mul(toBN(7)) });

            await timeTravel(playPeriod + 1);

            await rpsCont.cancelNoPlay(p1Hash, { from: player1 });

            const player1Initial = toBN(await web3.eth.getBalance(player1));

            const player1ContAft = await rpsCont.balances.call(player1, { from: player1 });
            const player2ContAft = await rpsCont.balances.call(player2, { from: player2 });
    
            const txObjWithdraw = await rpsCont.withdraw(player1ContAft, { from: player1 });
    
            const withdrawEvent = txObjWithdraw.logs[0];
            assert.strictEqual(withdrawEvent.event, 'LogWithdraw', 'Wrong event emitted.');
            assert.strictEqual(withdrawEvent.args.sender, player1, 'Withdraw Log Sender Error');
            assert.strictEqual(withdrawEvent.args.amount.toString(10), player1ContAft.toString(10), 'Withdraw Log Amont Error');
    
            const player1GasCost = await gasCost(txObjWithdraw);
            const player1Final = toBN(await web3.eth.getBalance(player1));

            // Check that cannot withdraw greater than contract balance. (Player 2's contract balance is 0 at this point.)
            await truffleAssert.reverts(rpsCont.withdraw( player2ContAft.add(toBN(1)), { from: player2 }));            
    
            assert.strictEqual(player1Initial.sub(player1GasCost).toString(10),
                player1Final.sub(player1ContAft).toString(10), "Player 1's expected balance incorrect.");
        });
        
        describe('Tests after a full game is completed.', function() {
            beforeEach('Complete 1 game.', async function() {
                await rpsCont.join(p1Hash, { from: player2 , value: p1Bet });
                await rpsCont.play(p1Hash, paper, { from: player2 });
                await rpsCont.unlock(p1Hash, p1Code, rock, { from: player1 });
            });

            it ("Cannot enrol with used-before hash.", async function() {
                await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet, { from: player1, value: p1Bet }));
            });

            it ("Post-killing withdrawal moves funds to the owner correctly.", async function() {
                await rpsCont.pause({ from: owner });
                await rpsCont.kill({ from: owner });
                
                const ownerBalBefore = toBN(await web3.eth.getBalance(owner));
                const txObjKW = await rpsCont.killedWithdrawal({ from: owner });
        
                const kwEvent = txObjKW.logs[0];
                assert.strictEqual(kwEvent.event, 'LogKilledWithdrawal', 'Wrong event emitted.');
                assert.strictEqual(kwEvent.args.sender, owner, 'Killed Withdrawal Log Sender Error');
                assert.strictEqual(kwEvent.args.amount.toString(10), p1Bet.mul(toBN(2)).toString(10), 'Killed Withdrawal Log Amount Error');
        
                const ownerGasCost = await gasCost(txObjKW);
                const ownerBalAfter = toBN(await web3.eth.getBalance(owner));
        
                assert.strictEqual(ownerBalBefore.sub(ownerGasCost).toString(10),
                    ownerBalAfter.sub(p1Bet.mul(toBN(2))).toString(10), "Owner's expected balance incorrect.");
            });
        });

        it ("Post-killing contract functions revert upon invocation.", async function() {
            await rpsCont.pause({ from: owner });		
            await rpsCont.kill({ from: owner });
            await rpsCont.unpause({ from: owner });		
    
            await truffleAssert.reverts(rpsCont.withdraw(initialDeposit, { from: player1 }));
            await truffleAssert.reverts(rpsCont.enrol(p1Hash, p1Bet, { from: player1, value: p1Bet }));
            await truffleAssert.reverts(rpsCont.join(p1Hash, { from: player2 , value: p1Bet }));
            await truffleAssert.reverts(rpsCont.play(p1Hash, rock, { from: player2 }));
            await truffleAssert.reverts(rpsCont.unlock(p1Hash, p1Code, rock, { from: player1 }));
            await truffleAssert.reverts(rpsCont.transferOwnership(player1, { from: owner }));
            await truffleAssert.reverts(rpsCont.cancelNoJoin(p1Hash, { from: player1 }));
            await truffleAssert.reverts(rpsCont.cancelNoPlay(p1Hash, { from: player1 }));
            await truffleAssert.reverts(rpsCont.cancelNoUnlock(p1Hash, { from: player2 }));
            
        });
    });

    it ("Funds moved correctly for game resulting in win-lose.", async function() {
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });

        //Check game status
        const statusNotInPlay = (await rpsCont.getStatus.call(p1Hash, { from: player2 }));
        assert.strictEqual(statusNotInPlay.toNumber(), notInPlay, 'Game Status - NotInPlay Error');

        const txObjEnrol = await rpsCont.enrol(p1Hash, p1Bet, { from: player1, value: p1Bet });

        const enrolEvent = txObjEnrol.logs[0];
        assert.strictEqual(enrolEvent.event, 'LogEnrol', 'Wrong event emitted.');
        assert.strictEqual(enrolEvent.args.sender, player1, 'Enrol Log Sender Error');
        assert.strictEqual(enrolEvent.args.bet.toString(10), p1Bet.toString(10), 'Enrol Log Bet Error');
        assert.strictEqual(enrolEvent.args.entryHash, p1Hash, 'Enrol Log Entry Hash Error');

        //Check game status
        const statusWaitingForJoin = (await rpsCont.getStatus.call(p1Hash, { from: player2 }));
        assert.strictEqual(statusWaitingForJoin.toNumber(), waitingForJoin, 'Game Status - WaitingForJoin Error');

        const txObjJoin = await rpsCont.join(p1Hash, { from: player2, value: initialDeposit });

        const joinEvent = txObjJoin.logs[0];
        assert.strictEqual(joinEvent.event, 'LogJoin', 'Wrong event emitted.');
        assert.strictEqual(joinEvent.args.entryHash, p1Hash, 'Wrong game entryHash.');
        assert.strictEqual(joinEvent.args.sender, player2, 'Join Log Sender Error');

        const p1Before = await rpsCont.balances.call(player1, { from: player1 });
        const p2Before = await rpsCont.balances.call(player2, { from: player2 });

        //Check game status
        const statusWaitingForPlay = (await rpsCont.getStatus.call(p1Hash, { from: player2 }));
        assert.strictEqual(statusWaitingForPlay.toNumber(), waitingForPlay, 'Game Status - WaitingForPlay Error');

        const txObjPlay = await rpsCont.play(p1Hash, paper, { from: player2 });

        const playEvent = txObjPlay.logs[0];
        assert.strictEqual(playEvent.event, 'LogPlay', 'Wrong event emitted.');
        assert.strictEqual(playEvent.args.entryHash, p1Hash, 'Wrong game entryHash.');
        assert.strictEqual(playEvent.args.sender, player2, 'Play Log Sender Error');
        assert.strictEqual(playEvent.args.move.toNumber(), paper, 'Play Log Move Error');

        //Check game status
        const statusWaitingForUnlock = (await rpsCont.getStatus.call(p1Hash, { from: player2 }));
        assert.strictEqual(statusWaitingForUnlock.toNumber(), waitingForUnlock, 'Game Status - WaitingForUnlock Error');

        // Check that player 2 cannot unlock using player 1's code and move.
        await truffleAssert.reverts(rpsCont.unlock(p1Hash, p1Code, rock, { from: player2 }));

        // Check that player 1 cannot change their submitted move.
        await truffleAssert.reverts(rpsCont.unlock(p1Hash, p1Code, scissors, { from: player1 }));

        const txObjUnlock = await rpsCont.unlock(p1Hash, p1Code, rock, { from: player1 });

        const unlockEvent = txObjUnlock.logs[0];
        assert.strictEqual(unlockEvent.event, 'LogUnlock', 'Wrong event emitted.');
        assert.strictEqual(unlockEvent.args.entryHash, p1Hash, 'Wrong game entryHash.');
        assert.strictEqual(unlockEvent.args.sender, player1, 'Unlock Log Sender Error');
        assert.strictEqual(unlockEvent.args.move.toNumber(), rock, 'Unlock Log Move Error');

        const unlockEvent2 = txObjUnlock.logs[1];
        assert.strictEqual(unlockEvent2.event, 'LogWinnerFound', 'Wrong event emitted.');
        assert.strictEqual(unlockEvent2.args.entryHash, p1Hash, 'Wrong game entryHash.');
        assert.strictEqual(unlockEvent2.args.winner, player2, 'Winner Found Log Winner Error');
        assert.strictEqual(unlockEvent2.args.loser, player1, 'Winner Found Log Loser Error');
        assert.strictEqual(unlockEvent2.args.amount.toString(10), p1Bet.toString(10), 'Winner Found Log Amount Error');

        // Check that player 1 cannot re-unlock their move.
        await truffleAssert.reverts(rpsCont.unlock(p1Hash, p1Code, rock, { from: player1 }));

        const p1After = await rpsCont.balances.call(player1, { from: player1 });
        const p2After = await rpsCont.balances.call(player2, { from: player2 });

        assert.strictEqual(p1Before.toString(10),
            p1After.toString(10), "Player 1's expected contract balance incorrect.");

        assert.strictEqual(p2Before.toString(10),
            p2After.sub(p1Bet.mul(toBN(2))).toString(10), "Player 2's expected contract balance incorrect.");

        //Check game status
        const statusGameCompleted = (await rpsCont.getStatus.call(p1Hash, { from: player2 }));
        assert.strictEqual(statusGameCompleted.toNumber(), gameCompleted, 'Game Status - GameCompleted Error');

        // Winner can use earnings to place bigger bet.

        const newBet = initialDeposit.add(p1Bet);
        const p2Code = fromAscii(generator());
        const p2Hash = await rpsCont.hashIt.call(p2Code, paper, { from: player2 });

        await rpsCont.enrol(p2Hash, newBet, { from: player2 });
    });

    it ("Can enrol and play if with 0 bet value.", async function() {
        const p1Before = await rpsCont.balances.call(player1, { from: player1 });
        const p2Before = await rpsCont.balances.call(player2, { from: player2 });
        
        const p1Bet = toBN(0);
        const p1Hash = await rpsCont.hashIt.call(p1Code, rock, { from: player1 });
        
        await rpsCont.enrol(p1Hash, p1Bet, { from: player1 });
        await rpsCont.join(p1Hash, { from: player2 });
        await rpsCont.play(p1Hash, paper, { from: player2 });
        await rpsCont.unlock(p1Hash, p1Code, rock, { from: player1 });

        const p1After = await rpsCont.balances.call(player1, { from: player1 });
        const p2After = await rpsCont.balances.call(player2, { from: player2 });

        assert.strictEqual(p1Before.toString(10),
            p1After.toString(10), "Player 1's final expected contract balance incorrect.");

        assert.strictEqual(p2Before.toString(10),
            p2After.toString(10), "Player 2's final expected contract balance incorrect.");
    });

    it ("Reverts killing when contract is not paused.", async function() {
        await truffleAssert.reverts(rpsCont.kill({ from: owner }));
    });

    it ("Reverts killing by non-pauser/owner.", async function() {
        await rpsCont.pause( {from: owner });
        await truffleAssert.reverts(rpsCont.kill({ from: player1 }));
    });

    describe("Post-killing withdrawal tests.", function() {
        beforeEach("Pause and Kill.", async function() {
            await rpsCont.pause( {from: owner });
            await rpsCont.kill( {from: owner });
        });

        it ("Reverts post-killing withdrawal by non-owner.", async function() {
            await truffleAssert.reverts(rpsCont.killedWithdrawal({ from: player1 }));
        });
    
        it ("Reverts post-killing withdrawal of 0 balance.", async function() {
            await truffleAssert.reverts(rpsCont.killedWithdrawal({ from: owner }));
        });
    });

    it ("Transfer Ownership sets owner to new owner.", async function() {
        const currentOwner = await rpsCont.getOwner.call({ from: owner });
        assert.strictEqual(currentOwner, owner, "Owner not as expected.");

        // Check that non-owner cannot transfer ownership.
        await truffleAssert.reverts(rpsCont.transferOwnership(player1, { from: player1 }));

        const txObjTransfer = await rpsCont.transferOwnership(player1, { from: owner });

        const transferEvent = txObjTransfer.logs[0];
        assert.strictEqual(transferEvent.event, 'LogTransferOwnership', 'Wrong event emitted.');
        assert.strictEqual(transferEvent.args.owner, owner, 'Transfer Ownership Log Old Owner Error');
        assert.strictEqual(transferEvent.args.newOwner, player1, 'Transfer Ownership Log New Owner Error');

        const transferEvent2 = txObjTransfer.logs[1];
        assert.strictEqual(transferEvent2.event, 'PauserAdded', 'Wrong event emitted');
        assert.strictEqual(transferEvent2.args.account, player1, 'Pauser Log New Pauser Error');

        const newOwner = await rpsCont.getOwner.call({ from: owner });
        assert.strictEqual(newOwner, player1, "Ownership not transferred correctly.");
    });

    describe('Multi-game tests.', function() {
        let hash = [];

        beforeEach('Set up hashes.', async function() {
            hash.push( await rpsCont.hashIt.call(p1Code, rock, { from: player1 }));
            hash.push( await rpsCont.hashIt.call(p1Code, paper, { from: player1 }));
            hash.push( await rpsCont.hashIt.call(p1Code, scissors, { from: player1 }));
        });

        it('Test that multiple on-going games give correct results and fund movements, regardless of completion order.', async function() {
            await rpsCont.enrol(hash[0], p1Bet, { from: player1, value: p1Bet.mul(toBN(6)) });
            await rpsCont.enrol(hash[1], p1Bet.mul(toBN(2)), { from: player1 });
            await rpsCont.enrol(hash[2], p1Bet.mul(toBN(3)), { from: player1 });

            const p1Before = await rpsCont.balances.call(player1, { from: player1 });

            const p2Bet = await rpsCont.getCurrentBet.call( hash[0], { from: player2 });
            await rpsCont.join(hash[0], { from: player2, value: initialDeposit });
            const p2Before = await rpsCont.balances.call(player2, { from: player2 });

            const p3Bet = await rpsCont.getCurrentBet.call( hash[1], { from: player3 });
            await rpsCont.join(hash[1], { from: player3, value: p3Bet})
            await rpsCont.play(hash[1], paper,{ from: player3 }); //player1 played paper.
            const p3Before = await rpsCont.balances.call(player3, { from: player3 });

            // check player 3 cannot play in the game player 2 has registered in.
            await truffleAssert.reverts(rpsCont.play(hash[0], rock, { from: player3 }));

            const p4Bet = await rpsCont.getCurrentBet.call( hash[2], { from: player4 });
            await rpsCont.join(hash[2], { from: player4, value: p4Bet})
            await rpsCont.play(hash[2], rock,{ from: player4 }); //player1 played scissors.
            const p4Before = await rpsCont.balances.call(player4, { from: player4 });

            await rpsCont.unlock(hash[2], p1Code, scissors, { from: player1 });

            await rpsCont.unlock(hash[1], p1Code, paper, { from: player1 });

            await rpsCont.play(hash[0], scissors,{ from: player2 }); //player1 played rock.
            await rpsCont.unlock(hash[0], p1Code, rock, { from: player1 });

            const p1After = await rpsCont.balances.call(player1, { from: player1 });
            const p2After = await rpsCont.balances.call(player2, { from: player2 });
            const p3After = await rpsCont.balances.call(player3, { from: player3 });
            const p4After = await rpsCont.balances.call(player4, { from: player4 });

            // player1: 1 win, 1 draw, 1 loss
            assert.strictEqual(p1Before.toString(10), p1After
                .sub(p2Bet.mul(toBN(2))) // for the win
                .sub(p3Bet) // for the draw
                .toString(10), 'Player 1 balance incorrect.');

            // player2: 1 loss
            assert.strictEqual(p2Before.toString(10), p2After.toString(10), 'Player 2 balance incorrect.');
            // player3: 1 draw
            assert.strictEqual(p3Before.toString(10), p3After.sub(p3Bet).toString(10), 'Player 3 balance incorrect.');
            // player4: 1 win
            assert.strictEqual(p4Before.toString(10), p4After.sub(p4Bet.mul(toBN(2))).toString(10), 'Player 4 balance incorrect.');
        });

        it('Test that cancelling before player 1 unlocks gives the correct refunds and allows the same entryHash to be used again.', async function() {
            await rpsCont.enrol(hash[0], p1Bet, { from: player1, value: p1Bet.mul(toBN(6)) });
            await rpsCont.enrol(hash[1], p1Bet.mul(toBN(2)), { from: player1 });
            await rpsCont.enrol(hash[2], p1Bet.mul(toBN(3)), { from: player1 });

            const p1Before = await rpsCont.balances.call(player1, { from: player1 });

            const p2Bet = await rpsCont.getCurrentBet.call( hash[1], { from: player2 });
            await rpsCont.join(hash[1], { from: player2, value: p2Bet });
            const p2Before = await rpsCont.balances.call(player2, { from: player2 });

            const p3Bet = await rpsCont.getCurrentBet.call( hash[2], { from: player3 });
            await rpsCont.join(hash[2], { from: player3, value: p3Bet });
            await rpsCont.play(hash[2], rock, { from: player3 });
            const p3Before = await rpsCont.balances.call(player3, { from: player3 });

            await timeTravel(unlockPeriod + 1);

            await rpsCont.cancelNoJoin(hash[0], { from: player1 });
            const p1After = await rpsCont.balances.call(player1, { from: player1 });
            assert.strictEqual(p1Before.toString(10), p1After.sub(p1Bet).toString(10), 'Refund from "cancelNoJoin" failure.');

            const p1Before2 = await rpsCont.balances.call(player1, { from: player1 });
            await rpsCont.cancelNoPlay(hash[1], { from: player1 });
            const p1After2 = await rpsCont.balances.call(player1, { from: player1 });
            assert.strictEqual(p1Before2.toString(10), p1After2.sub(p2Bet.mul(toBN(2))).toString(10), 'Refund from "cancelNoPlay" failure.');
            
            const p2After = await rpsCont.balances.call(player2, { from: player2 });
            assert.strictEqual(p2Before.toString(10), p2After.toString(10), 'Erroneous refund from "cancelNoPlay".');

            await rpsCont.cancelNoUnlock(hash[2], { from: player3 });
            const p3After = await rpsCont.balances.call(player3, { from: player3 });
            assert.strictEqual(p3Before.toString(10), p3After.sub(p3Bet.mul(toBN(2))).toString(10), 'Refund from "cancelNoUnlock" failure.');

            // Check that entryHashes can all be used again.
            await rpsCont.enrol(hash[0], p1Bet, { from: player1, value: p1Bet });
            await rpsCont.enrol(hash[1], p1Bet, { from: player1, value: p1Bet });
            await rpsCont.enrol(hash[2], p1Bet, { from: player1, value: p1Bet });
        });
    });
})