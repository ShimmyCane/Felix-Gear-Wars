# Felix Gear Wars: ten more characters (proposals)

Not built yet. Each one is a fighter that drops from a gear, like the others, with a tier so it fits the unit cap (tier 11 to 20 would take caps of 55 to 100, so a new tier needs a cap decision too). Stats are sketches to be tuned with `tools/balance_tune.js`, not final numbers. Names and art are original; nothing here copies another game's characters.

For each: what it does, how it works with the others, and how it works against.

1. **Standard-bearer.** A banner carrier. Every allied fighter within 200 px gets +20% health. The banner has 90 health of its own; when it falls, nearby allies lose their courage for 3 s and walk back.
   - With: pairs with any big group, especially the tank line.
   - Against: a fighter that targets the banner first (the assassin hunts ranged units, so give the banner a priority only from the front).

2. **Net-thrower.** Throws a net at the first enemy that comes within 220 px. The net holds that enemy for 4 s; a netted knight or cart cannot charge.
   - With: a net before a tank lets the tank hit a stuck target.
   - Against: charge units (the knight, the cart, the griffin). Weak to the archer's arrows, so keep it behind a wall.

3. **Pike wall.** Stands still, a hedge of pikes two fighters deep. It never walks forward, but it hits anything that walks into it with a long reach (150 px), and allies can walk through it.
   - With: a pike wall at the front lets archers and mages fire over it.
   - Against: a cart rolling through it (the cart's pierce should still hit it), and it is useless against catapult stones, which fly over.

4. **Kite rider.** A horseman with a short bow. It shoots, then backs off when an enemy is within 90 px, so spearmen never reach it.
   - With: any melee front line; it keeps the enemy busy.
   - Against: slow units (the tank, the catapult). Weak to the assassin, which is faster.

5. **Sapper.** Carries a fuse. When it reaches an enemy castle, tower or the fortress, it sets a charge: 3 times the siege damage after 6 s, and it stops working if it is knocked back.
   - With: a shield caster in front of it protects it from stones on the way in.
   - Against: any unit that kills it before it reaches a structure, so it needs cover. Good against the fortress late in the game.

6. **Fog-pot bombardier.** Throws a pot of smoke at a point 300 px ahead; smoke for 6 s makes every archer and mage inside it miss half their shots.
   - With: a Fog-pot before a charge lets the knights get in.
   - Against: ranged units. Does nothing to melee units, so it cannot stop a spear wall.

7. **Duelist.** A fencer who parries the first hit of every fight (no damage) and then strikes twice as fast.
   - With: a duelist beats the assassin and the knight one at a time.
   - Against: units that hit many times at once (the mage's splash, the catapult), because a parry is wasted on a single target.

8. **Scout.** Runs ahead of the wave and reveals the next wave's types on the top of the screen for 8 s.
   - With: a scout tells Felix which counter to buy before the wave lands. Information, not damage.
   - Against: nothing directly. A scout that dies early shows nothing, so it is fragile (health 40).

9. **Drummer.** Stands next to a gear (a peg next to a gear). That gear needs 15% fewer ticks for each unit it makes.
   - With: the gear chain. A drummer next to a multiplier gear stacks with it, so keep the multiplier's cap in mind.
   - Against: a drummer is useless in the open; it only works on a board, not on the battlefield. It is a gear more than a fighter, so put it in the tray as a special.

10. **Ferryman.** Carries a wounded ally back to a gear: a unit under 20% health is pulled out of the fight, walks back, and is healed to half health after 8 s.
    - With: any unit that dies in front of the line; it keeps the army alive for the next wave.
    - Against: none directly. The cost is a fighter that does not attack while it ferries.

## Notes for choosing

- Each one has a counter and a weakness, so none of them is simply better. The counters are the point.
- Several of them fight the existing units, which the balance tool already measures (unit against unit). Add them to the `matchups` table before deciding.
- If Jimmy picks a few, start with the three that need the least new mechanics: the standard-bearer (an aura, like the unicorn's heal), the net-thrower (a single status effect, like the cart's knock-back) and the scout (a UI effect with no combat change).

## More ideas (from the author, for later units)

- **Freezer.** Slows enemies. At higher levels it chooses which units to slow, and can pick the most dangerous ones.
- **Summoner (the defensive creature).** Summons a defensive creature, and keeps summoning if its primary creature dies. At higher levels the defensive creature is trapped on destruction (it holds an enemy in place as it dies).
- **Builder.** Builds towers that attack, heal, or garrison, and defensive structures such as spike walls. At higher levels it builds different things; a top-level builder can build an armoury that gives its units extra attacks.
