# Status Effects Documentation

This document lists all status effects available in the battle system, their mechanics, icons, and usage.

## Status Effects

### Stun
- **Icon**: <:Stun:1479135399573061751>
- **Mechanics**: Prevents the affected card from taking actions for the duration.
- **Duration**: Specified in turns (doubled internally for proper timing).
- **Application**: Can be applied to self or target based on "itself" flag.

### Freeze
- **Icon**: <:Freeze:1479137305749880924>
- **Mechanics**: Prevents the affected card from taking actions for the duration. Unfrozen by taking damage.
- **Duration**: Specified in turns (doubled internally for proper timing).
- **Application**: Can be applied to self or target based on "itself" flag.

### Cut
- **Icon**: <:Cut:1479136751397109771>
- **Mechanics**: Deals 1 HP damage at the start of each turn.
- **Duration**: Specified in turns.
- **Application**: Can be applied to self or target based on "itself" flag.

### Bleed
- **Icon**: <:1000043584:1479138154572156928>
- **Mechanics**: Deals 2 HP damage at the start of each turn.
- **Duration**: Specified in turns.
- **Application**: Can be applied to self or target based on "itself" flag.

### Regen
- **Icon**: <:regen:1485292289827016734>
- **Mechanics**: Restores a percentage of max HP (rounded up) at the start of each turn.
- **Parameters**: `effectAmount` (default 10%) - percentage of HP to regenerate.
- **Duration**: Specified in turns.
- **Application**: Can be applied to self or target based on "itself" flag.

### Confusion
- **Icon**: <:confused:1485292931597209811>
- **Mechanics**: Chance to miss attacks during the duration.
- **Parameters**: `effectChance` (default 30%) - percentage chance to miss.
- **Duration**: Specified in turns.
- **Application**: Can be applied to self or target based on "itself" flag.

### Attack Up
- **Icon**: <:atkup:1485295694053900328>
- **Mechanics**: Increases attack damage by a percentage.
- **Parameters**: `effectAmount` (default 25%) - percentage increase.
- **Duration**: Specified in turns.
- **Application**: Can be applied to self or target based on "itself" flag.

### Attack Down
- **Icon**: <:attackdown:1485296830295314492>
- **Mechanics**: Decreases attack damage by a percentage.
- **Parameters**: `effectAmount` (default 25%) - percentage decrease.
- **Duration**: Specified in turns.
- **Application**: Can be applied to self or target based on "itself" flag.

### Defense Up
- **Icon**: <:defenseup:1485297398942269510>
- **Mechanics**: Increases defense (reduces incoming damage) by a percentage.
- **Parameters**: `effectAmount` (default 25%) - percentage increase.
- **Duration**: Specified in turns.
- **Application**: Can be applied to self or target based on "itself" flag.

### Defense Down
- **Icon**: <:defensedown:1485297768535949524>
- **Mechanics**: Decreases defense (increases incoming damage) by a percentage.
- **Parameters**: `effectAmount` (default 25%) - percentage decrease.
- **Duration**: Specified in turns.
- **Application**: Can be applied to self or target based on "itself" flag.

### Truesight
- **Icon**: <:truesight:1485299663879012484>
- **Mechanics**: Dodges all incoming attacks during the duration.
- **Duration**: Specified in turns.
- **Application**: Can be applied to self or target based on "itself" flag.

### Undead
- **Icon**: <:undead:1485300491930959882>
- **Mechanics**: Card remains alive at 0 HP. Dies when effect expires, but can be revived if HP is restored before expiration.
- **Duration**: Specified in turns.
- **Application**: Can be applied to self or target based on "itself" flag.


## Usage in Cards

Status effects are defined in card data with the following properties:
- `effect`: The effect type (string)
- `effectDuration`: Number of turns (optional, default 1)
- `effectAmount`: Percentage for regen/attack/defense modifiers (optional, default 10 for regen, 25 for attack/defense)
- `effectChance`: Percentage for confusion miss chance (optional, default 30)
- `itself`: Boolean flag - if true, applies to the attacker; if false or missing, applies to the target

Example:
```javascript
{
  effect: 'regen',
  effectDuration: 3,
  effectAmount: 10,
  itself: true
}
```

## Logging

Status effects are logged in battle action text with their icons and details. For example:
- `Monkey D. Luffy used Gomu Gomu no Giant Pistol for **12 damage**! (<:undead:1485300491930959882> undead's itself for 3 turns) :energy: -3`