# Card Addition Guide

This guide explains how to properly add new cards to the game. Follow these instructions for consistent card creation.

## Card ID Format

The system auto-generates IDs with this format:
```
[First letters of name parts][Rank][Upgrade number]
Example: "MDLB1" = Monkey D. Luffy, B rank, U1
```

IDs handle collisions automatically by adding more letters.

## File Structure

cards are defined in two main files:
- **cards.js** - Primary cards (main story characters)
- **morecards.js** - Secondary cards (early arc and side characters)
- **crews.js** - Faculty/crew definitions and their ranks
- **marines.js** - Marine organization characters

## Card Data Format

Cards use a **consolidated format** where upgrades are nested to reduce repetition:

```javascript
{
  character: 'Character Name',           // Full character name
  alias: ['alias1', 'alias2'],           // Search aliases (lowercase)
  upgradeTotal: 3,                       // Total number of upgrades (1-4)
  pullable: true,                        // Can be pulled from summon (false for upgrades)
  attribute: 'STR',                      // STR, DEX, PSY, INT, or QCK
  emoji: '<:CustomEmoji:1234567890>',    // Discord emoji reference (use null if missing)
  title: 'Character Title/Role',         // Character title
  faculty: 'Crew/Faculty Name',          // Which crew/faculty (must exist in crews.js)
  rank: 'B',                             // Rank: D, C, B, A, S, SS, UR
  power: 10,                             // Power stat
  health: 15,                            // Health stat
  speed: 3,                              // Speed stat
  attack_min: 2,                         // Minimum attack damage
  attack_max: 2,                         // Maximum attack damage
  image_url: 'https://...',              // Character image URL (use null if missing)
  
  // Optional fields for U1:
  special_attack: {                      // Only for S rank and above
    name: 'Attack Name',
    min_atk: 3,
    max_atk: 5,
    gif: 'https://...'                   // Status effect animation (use null if missing)
  },
  effect: 'stun',                        // Status effect type (see valid list below)
  effectDuration: 3,                     // How many turns effect lasts
  effectAmount: 5,                       // Potency of effect
  boost: 'Description of boost effect',  // For boost-type cards (string description)
  
  // Upgrades (optional):
  secondupgrade: { ... },                // Same format as above
  thirdupgrade: { ... },
  fourthupgrade: { ... }
}
```

## Upgrade Guidelines

Determine the number of upgrades based on **anime importance**:

- **Main crew captains** (Luffy, Whitebeard, Blackbeard): 4 upgrades
- **Important crew members** (Zoro, Sanji, major commanders): 3 upgrades
- **Notable crew members** (Nami, Robin, division commanders): 3 upgrades
- **Moderate crew members** (regular crew, some officers): 2 upgrades
- **Less important/background characters**: 1 upgrade

### Examples:
- Luffy → 4 upgrades (protagonist)
- Whitebeard → 3 upgrades (Yonko captain)
- Roronoa Zoro → 3 upgrades (first mate)
- Bonk Punch → 1-2 upgrades (background crew member)

## Rank Assignment

Use these guidelines for rank assignment:

| Rank | Examples | Power Range | When to Use |
|------|----------|-------------|------------|
| D | Background characters, weak enemies | 5-15 power | Truly insignificant roles |
| C | Early arc characters, weak fighters | 8-20 power | Weak but notable |
| B | Solid crew members, early arcs | 12-30 power | Normal fighter level |
| A | Strong crew members, commanders | 16-35 power | Notable fighters |
| S | Very strong characters, senior leaders | 24-50 power | Powerful fighters |
| SS | Elite level, major characters | 45-60+ power | Very powerful |
| UR | Peak tier, protagonists | 50+ power | Extremely powerful |

## Special Attacks

- **Required for:** S rank and above only
- **Damage scaling:** Usually 1.5-2x normal attack damage (special_attack.max_atk ≈ 2-3x attack_max)
- **All special attacks must include a status effect** (from the valid list above)
- **Status effect strength scales with card importance:**
  - Weaker cards: Choose gentler effects (confuse, attackdown, defensedown)
  - Stronger cards: Choose more impactful effects (stun, freeze, bleed, undead)
  - Elite/Yonko level: Use undead, stun, or bleed with high duration/amount

**Example:**
- Normal attack: attack_max = 10
- Special attack: max_atk = 18-25 (roughly 2-2.5x)

## Attributes

Map character abilities to attributes based on the colored icon in the image. The letter shown is the first letter of the attribute:

| Color | Icon Letter | Attribute | Type | Examples |
|-------|-------------|-----------|------|----------|
| Red | S | STR | Strength/Power | Luffy, Zoro, Whitebeard |
| Green | D | DEX | Dexterity/Speed | Sanji, Nami, Usopp |
| Blue | Q | QCK | Quick/Speed | Luffy, Yassopp |
| Yellow | P | PSY | Wisdom/Mind | Chopper, Robin |
| Purple | I | INT | Intellect/Tactics | Nami, Robin |

## Boost Type Cards

Some characters cannot or primarily don't fight (doctors, cooks, navigators):

**Boost type cards have:**
- **NO** `special_attack`
- `boost` field: String listing which characters they boost and by percentage

**Example:**
```javascript
{
  character: 'Makino',
  title: 'Barmaid of the Partys Bar',
  boost: 'Monkey D. Luffy (5%), Figarland Shanks (5%)',
  // ... other fields
}
```

## Stat Scaling Example

**For B rank character:**
```
power: 12-15
health: 20-25
speed: 3-5
attack_min: 2-3
attack_max: 4-5
```

**When upgrading to A rank:**
```
power: 16-20 (+30-50%)
health: 28-35 (+30-40%)
speed: 7-10 (+50-100%)
attack_min: 4-5 (+50%)
attack_max: 7-9 (+50-75%)
```

## Faculty Management

If a character belongs to a crew not in crews.js, add it following this format:

```javascript
{
  name: "Crew/Faculty Name",
  icon: '<:FacultyEmoji:1234567890>',  // Discord emoji
  rank: 'A'                             // Crew's overall rank
}
```

Crew ranks roughly correspond to:
- D: Small/minor crews
- C: Notable but small crews
- B: Mid-tier crews
- A: Major pirate crews, strong factions
- S: Yonko crews, top-tier organizations
- SS: Only for Yonko + Marines combo

## Upgrade Requirements

**When to add upgrade requirements:**
- For important/main characters only (S+ rank or major plot characters)
- Should be cards the character is closest to or allies with

**How to determine requirements:**
- Pick 3-4 cards that are closely related to the character
- These can be existing cards or future cards (guess the ID based on patterns)
- Usually allies, crew members, or rivals

**Card ID format for guessing:**
```
[First letters][Rank][Upgrade number]
Examples:
- Roronoa Zoro, B rank, U1 = RZB1
- Nami, C rank, U1 = NC1
- Marshall D. Teach, SS rank, U2 = MDTSS2
```

**Example from Luffy:**
```javascript
upgradeRequirements: ['RZB1', 'NC1', 'UC1', 'VSB1']
// Roronoa Zoro B1, Nami C1, Usopp C1, Vinsmoke Sanji B1
```

**Where to place:**
- Add `upgradeRequirements` to the specific upgrade object (secondupgrade, thirdupgrade, etc.)
- Not to the base card, only to the upgrade versions

## Placeholder Values

When you don't have final assets, use `null` instead of string placeholders:

- **image_url:** `null`
- **character emoji:** `null`
- **gif in special_attack:** `null`

**Important:** Do NOT use string values like `'IMAGE_PLACEHOLDER'` as placeholders, as this will cause validation errors in Discord.js. Always use `null` for missing assets.

## Valid Status Effects

These are the ONLY available status effects in the game. Use ONLY these names:

- **stun** - Prevents action for duration
- **freeze** - Prevents action, unfrozen by taking damage
- **cut** - 1 HP damage per turn
- **bleed** - 2 HP damage per turn
- **regen** - Restores percentage of max HP per turn
- **confusion** - Chance to miss attacks (use `effectChance` for miss %)
- **attackup** - (NOT "Attack Up") Increases attack by percentage
- **attackdown** - (NOT "Attack Down") Decreases attack by percentage
- **defenseup** - Increases defense by percentage
- **defensedown** - Decreases defense by percentage
- **truesight** - Dodges all incoming attacks
- **undead** - Card remains alive at 0 HP

⚠️ **Common Mistakes:**
- `burn` and `poison` do NOT exist - use `bleed` for damage-over-time effects
- `speeddown` does NOT exist
- `paralysis` does NOT exist - use `stun` or `freeze` instead

## Card ID Format

The system auto-generates IDs with this format:
```
[First letters of name][Rank][Upgrade number]
Example: "MDLB1" = Monkey D. Luffy, B rank, U1
```

IDs handle collisions automatically by adding more letters.

## Final Checklist

Before submitting cards:

- [ ] All required fields are filled (except placeholders)
- [ ] Attributes match character abilities
- [ ] Ranks are appropriate for anime importance
- [ ] Stats scale properly through upgrades
- [ ] S+ rank cards have special attacks with status effects
- [ ] All faculties exist in crews.js
- [ ] Aliases are lowercase
- [ ] upgrade_total matches number of upgrade objects
- [ ] Special attack damage is approximately 2x normal attack
- [ ] Effect durations are reasonable (1-5 turns)
- [ ] **Status effects used are ONLY from the valid list** (no burn/poison/paralysis/speeddown)
- [ ] **Stronger cards have stronger/more impactful status effects**
- [ ] **Non-combat support characters use boost type** (power: 1, attack_min/max: 0, with boost field)
- [ ] **Important characters have upgrade requirements added to their upgrade objects**
- [ ] **All effect names use lowercase** (attackdown, defensedown, not "Attack Down")
