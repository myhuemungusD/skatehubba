# S.K.A.T.E. Game Rules

## What is S.K.A.T.E.?

S.K.A.T.E. is a classic skateboarding game where two skaters take turns attempting tricks. If your opponent fails to land your trick, they get a letter (S, then K, then A, then T, then E). The first player to spell out "S.K.A.T.E." loses.

Think of it like skateboarding's version of H-O-R-S-E in basketball.

---

## How SkateHubba's S.K.A.T.E. Works

### Traditional S.K.A.T.E. (In Person)
1. **Attacker** does a trick
2. **Defender** must land the same trick
3. If defender fails → they get a letter
4. If defender lands it → no letter, they become the attacker
5. First to spell S.K.A.T.E. loses

### SkateHubba S.K.A.T.E. (Async Video-Based)

Our version adapts the classic game for **remote, asynchronous play** with video proof:

#### 1. Challenge Phase
- Player A challenges Player B to a game
- Player B accepts or declines
- The challenger goes first

#### 2. Turn Flow

**Attacker's Turn:**
1. Records a trick attempt (up to 30 seconds)
2. Uploads video to SkateHubba
3. Describes the trick (e.g., "kickflip down the 5-stair")
4. Submits to opponent

**Defender's Turn:**
1. Watches attacker's video
2. **Judges** whether the trick was landed or bailed
   - **LAND** = Clean landing, defender must attempt it
   - **BAIL** = Didn't land, attacker gets no points, next turn
3. If defender judges it a **LAND**, they must attempt the same trick
4. Records their own attempt
5. Uploads video for judgement

**Judgement:**
- Attacker judges defender's attempt
- **LAND** = Defender matched it, no letter
- **BAIL** = Defender failed, gets a letter

#### 3. Voting & Timeouts
- **Voting Window:** 60 seconds to judge each trick
- **Timeout Rule:** If judge doesn't vote in time, defender wins by default
- **Tie Rule:** If both players end with the same letters, the challenger (creator) wins

#### 4. Disputes
- Don't agree with a judgement? File a **dispute**
- Admin reviews both videos and makes final call
- Disputes prevent unfair judgements

#### 5. Winning
- First player to spell S-K-A-T-E loses
- Winner gets XP and leaderboard points
- Game history saved permanently

---

## Example Game Flow

```
Game Start: Alice challenges Bob

Turn 1:
  Alice (attacker): Records kickflip → uploads video
  Bob (defender): Judges it as LAND
  Bob: Attempts kickflip → lands it clean
  Alice: Judges it as LAND
  Result: No letters, Bob becomes attacker

Turn 2:
  Bob (attacker): Records backside 180 → uploads video
  Alice (defender): Judges it as LAND
  Alice: Attempts backside 180 → bails
  Bob: Judges it as BAIL
  Result: Alice gets "S"

Turn 3:
  Alice (attacker): Records tre flip → uploads video
  Bob (defender): Judges it as LAND
  Bob: Attempts tre flip → lands it
  Alice: Judges it as LAND
  Result: No letters, Bob becomes attacker

Turn 4:
  Bob (attacker): Records nollie heelflip → uploads video
  Alice (defender): Judges it as LAND
  Alice: Attempts nollie heelflip → bails
  Bob: Judges it as BAIL
  Result: Alice gets "K"

[Game continues until Alice or Bob spells S.K.A.T.E.]
```

---

## Key Differences from Traditional S.K.A.T.E.

| Feature | Traditional (In-Person) | SkateHubba (Async Video) |
|---------|------------------------|--------------------------|
| **Location** | Must be at same spot | Anywhere in the world |
| **Timing** | Real-time, immediate turns | Asynchronous, play when available |
| **Proof** | Honor system + witnesses | Video evidence required |
| **Judgement** | Both players agree | Opponent judges, disputes available |
| **Duration** | 10-30 minutes | Hours or days (async) |
| **Audience** | Only present spectators | Anyone can watch later |

---

## Strategy Tips

### As Attacker
- **Record Clean Tricks:** Sloppy landings might get judged as BAIL
- **Know Your Opponent:** Don't set tricks they can easily land
- **Be Creative:** Unique tricks are harder to match
- **Film Clearly:** Poor video quality might lead to disputes

### As Defender/Judge
- **Judge Fairly:** Unfair judgements lead to disputes and admin intervention
- **Be Honest:** If opponent landed it clean, call it LAND
- **Vote Quickly:** Don't timeout and give them free points
- **Watch Closely:** Slow-mo the video if needed

### General
- **Build Repertoire:** Practice a variety of tricks for offense and defense
- **Document Everything:** Videos are permanent proof
- **Respect the Game:** S.K.A.T.E. is built on honor and skill

---

## Technical Details

### Video Requirements
- **Max Length:** 30 seconds per trick
- **Format:** MP4, WebM, or MOV
- **Storage:** Firebase Cloud Storage
- **Processing:** Automatic compression and thumbnail generation

### Game State
- **Database:** PostgreSQL with row-level locking (prevents race conditions)
- **Real-time:** Socket.io updates for instant notifications
- **Idempotency:** Duplicate votes prevented via event IDs
- **Persistence:** Full game history stored indefinitely

### Timeouts & Deadlines
- **Turn Submission:** Players have flexible time windows
- **Voting Deadline:** 60 seconds to judge a trick
- **Forfeit:** Can surrender anytime if overwhelmed

---

## FAQ

### Can I play against anyone?
Yes! Challenge any SkateHubba user to a game.

### What happens if someone cheats?
File a dispute. Admins review video evidence and make final rulings. Repeat offenders may be banned.

### Can I watch other people's games?
Not yet, but spectator mode is on the roadmap for Q2 2026.

### What if my opponent never responds?
Games have timeouts. If opponent doesn't respond within the deadline, you win by forfeit.

### Do I need to match the trick exactly?
Same trick, but your own style is fine. A kickflip is a kickflip whether it's styled or stiff. Defender judges based on whether you landed the core trick.

### Can I use old footage?
No. Tricks must be recorded specifically for that turn to prevent recycling clips.

---

## What Makes This Different from Other Skate Apps?

**Shred Spots, The Spot Guide, Skately** — Great for finding spots, but no gameplay.

**SkateHubba** — The only app where you can **challenge skaters worldwide to video-based S.K.A.T.E. battles**.

Turn-based, asynchronous gameplay means you can face someone in Japan, Brazil, or Australia without coordinating schedules. Just record your trick, upload, and wait for their response.

**This is skateboarding's first async turn-based video game.**

---

## Coming Soon

- **Tournament Mode:** Bracket-style competitions with prizes
- **Spectator Mode:** Watch live games in progress
- **Trick Recognition AI:** Automatic trick identification and scoring
- **Team Battles:** 2v2 or crew vs. crew
- **Leaderboard Integration:** S.K.A.T.E. wins contribute to overall rank

---

**Ready to play?** Head to the game lobby and challenge someone: [Get Started](../client/src/pages/ChallengeLobby.tsx)
