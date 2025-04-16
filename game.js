const canvas = document.getElementById('gameCanvas');
const context = canvas.getContext('2d');

// Minimap setup
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapContext = minimapCanvas.getContext('2d');
let minimapScale = 0; // Will be calculated based on map size

// Add roundRect polyfill if not supported
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        if (width < 2 * radius) radius = width / 2;
        if (height < 2 * radius) radius = height / 2;
        this.beginPath();
        this.moveTo(x + radius, y);
        this.arcTo(x + width, y, x + width, y + height, radius);
        this.arcTo(x + width, y + height, x, y + height, radius);
        this.arcTo(x, y + height, x, y, radius);
        this.arcTo(x, y, x + width, y, radius);
        this.closePath();
        return this;
    };
}

// --- Constants ---
// Gameplay map boundaries (where units can move and buildings can be placed)
const MAP_WIDTH = 3200;  // Doubled the map size
const MAP_HEIGHT = 3200; // Doubled the map size
const TILE_COUNT = 8; // 8x8 grid
const TILE_WIDTH = MAP_WIDTH / TILE_COUNT;
const TILE_HEIGHT = MAP_HEIGHT / TILE_COUNT;

// Visual boundaries (extended area where camera can pan)
const VISUAL_BOUNDARY_EXTENSION = 800; // 800 pixels of extra space on each side
const VISUAL_MAP_WIDTH = MAP_WIDTH + (VISUAL_BOUNDARY_EXTENSION * 2);
const VISUAL_MAP_HEIGHT = MAP_HEIGHT + (VISUAL_BOUNDARY_EXTENSION * 2);

// Visual boundary colors
const VISUAL_BOUNDARY_COLOR = '#0F0F12'; // Very dark color for the extended area
const BOUNDARY_INDICATOR_COLOR = 'rgba(255, 255, 255, 0.15)'; // Subtle white line for the gameplay boundary

// Camera System Constants
const EDGE_SCROLL_MARGIN = 20; // Pixels from edge that triggers scrolling
const CAMERA_SPEED = 8; // Speed of camera movement (reduced for better control)

// Tile colors for each perimeter layer - darker overall with more subtle differences
const PERIMETER_COLORS = [
    '#17171A', // Outer layer - Darker charcoal, almost black
    '#1E1E21', // Second layer - Even darker gray with minimal blue tint
    '#2A2A30', // Third layer - Dark gray with subtle blue tint
    '#383842'  // Inner layer - Slightly brighter gray-blue, but still dark
];

const MOVEMENT_MARKER_START_RADIUS = 15;
const MOVEMENT_MARKER_DURATION = 750; // Shorten duration slightly for faster fade

// Performance Monitor Constants
const PERFORMANCE_UPDATE_INTERVAL = 500; // Update every 500ms
const FPS_SAMPLE_SIZE = 60; // Number of frames to average FPS over

// --- Canvas Setup ---
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Initialize minimap
minimapCanvas.width = 300;
minimapCanvas.height = 300;
minimapScale = Math.min(
    minimapCanvas.width / MAP_WIDTH,
    minimapCanvas.height / MAP_HEIGHT
);

// Camera System
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Update minimap canvas size
    minimapCanvas.width = 300;
    minimapCanvas.height = 300;

    // Calculate minimap scale
    minimapScale = Math.min(
        minimapCanvas.width / MAP_WIDTH,
        minimapCanvas.height / MAP_HEIGHT
    );
});

// --- Game State ---
const gameObjects = []; // Holds all units and bunkers
let selectedUnits = [];
let currentPlayerId = 1; // Start as Player 1
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragEndX = 0;
let dragEndY = 0;
const movementMarkers = []; // To store {x, y, timestamp, playerId}
const attackEffects = []; // Store temporary attack visuals (LASER LINES)
const floatingTexts = []; // Store floating text elements for resource gains

// Game timer variables
let gameStartTime = Date.now();
let gameTimeInSeconds = 0;
const gameTimerElement = document.getElementById('gameTimer');
const MARKER_DURATION_MS = 1000; // How long movement markers last
const CLICK_DRAG_THRESHOLD = 5; // Pixels to differentiate click vs drag
const CHECKER_SIZE = 50; // Size of background checker squares
const BACKGROUND_COLOR_1 = '#222222';
const BACKGROUND_COLOR_2 = '#282828';
const SELECTION_COLOR = 'white';
const MOVEMENT_MARKER_COLOR = 'hsl(60, 50%, 60%)'; // Softer yellow
let isAMoveMode = false; // Tracks if we are waiting for A-move click
const TARGET_ACQUISITION_RANGE_FACTOR = 1.5; // How much farther units look than they shoot
const BUNKER_SPAWN_COOLDOWN = 1500; // ms (1.5 seconds) - Increased spawn rate
const BUILD_TIME = 5000; // 5 seconds to build a structure
const SUPPLY_DEPOT_SUPPLY_BONUS = 5; // Supply bonus from a supply depot
const BUNKER_SUPPLY_BONUS = 5; // Supply bonus from a bunker
const SHIELD_TOWER_ARMOR_BONUS = 5; // Armor bonus from shield tower
const SHIELD_TOWER_RADIUS = 300; // Shield tower radius (3 tiles - doubled from 1.5 tiles)

// Building costs
const BUILDING_COSTS = {
    bunker: 50,
    supplyDepot: 30,
    shieldTower: 10,
    sensorTower: 10
};

// Building grid sizes (width x height in grid cells)
const BUILDING_GRID_SIZES = {
    bunker: { width: 3, height: 3 },         // 3x3 grid cells (large structure)
    supplyDepot: { width: 3, height: 2 },    // 3x2 grid cells (horizontal structure)
    shieldTower: { width: 1, height: 1 },    // 1x1 grid cells (compact structure)
    sensorTower: { width: 1, height: 1 }     // 1x1 grid cells (compact structure)
};

// Building grid constants
const GRID_CELLS_PER_TILE = 4; // 4x4 grid within each tile

// Define the inner area of each tile (where the grid will be placed)
// This corresponds to the centered building area of each tile
const INNER_TILE_RATIO = 0.6; // The inner area is 60% of the tile size
const INNER_TILE_WIDTH = Math.floor(TILE_WIDTH * INNER_TILE_RATIO);
const INNER_TILE_HEIGHT = Math.floor(TILE_HEIGHT * INNER_TILE_RATIO);

// Calculate the offset from tile edge to the inner area (ensure it's centered)
const INNER_TILE_OFFSET_X = Math.floor((TILE_WIDTH - INNER_TILE_WIDTH) / 2);
const INNER_TILE_OFFSET_Y = Math.floor((TILE_HEIGHT - INNER_TILE_HEIGHT) / 2);

// Size of each grid cell within the inner area (ensure they're even)
const GRID_CELL_WIDTH = Math.floor(INNER_TILE_WIDTH / GRID_CELLS_PER_TILE);
const GRID_CELL_HEIGHT = Math.floor(INNER_TILE_HEIGHT / GRID_CELLS_PER_TILE);

// Recalculate inner area to ensure it's exactly divisible by grid cells
const ADJUSTED_INNER_TILE_WIDTH = GRID_CELL_WIDTH * GRID_CELLS_PER_TILE;
const ADJUSTED_INNER_TILE_HEIGHT = GRID_CELL_HEIGHT * GRID_CELLS_PER_TILE;

// Building placement mode
let buildingPlacementMode = false;
let buildingTypeToPlace = null;
let buildingWorkers = []; // Workers assigned to build
let buildingPlacementX = 0;
let buildingPlacementY = 0;
let buildingGridX = 0; // Grid cell X coordinate for preview
let buildingGridY = 0; // Grid cell Y coordinate for preview
let buildingPlacementGridX = 0; // Stored grid X for actual placement
let buildingPlacementGridY = 0; // Stored grid Y for actual placement
let isValidPlacement = false; // Whether current placement is valid
const RALLY_POINT_MARKER_COLOR = 'lime';
const HEALTH_BAR_COLOR = 'white';
const HEALTH_BAR_FONT = '10px Arial';
const BUNKER_HEALTH_FONT = '12px Arial';
const ATTACK_RANGE_INDICATOR_COLOR = 'rgba(255, 0, 0, 0.2)'; // Semi-transparent red
const ATTACK_EFFECT_COLOR = 'red';
const ATTACK_EFFECT_DURATION = 100; // ms
const SPARK_BURST_COLOR = 'white';
const SPARK_BURST_DURATION = 150; // ms, slightly longer than laser
const SPARK_COUNT = 5;
const SPARK_LENGTH = 4;

// Constants for styling
const DASH_PATTERN = [6, 4]; // 6px line, 4px gap
const ROTATION_SPEED_FACTOR = 0.05; // Slower is faster denominator, adjust as needed
const RALLY_LINE_DASH_PATTERN = [5, 5];
const RALLY_LINE_ANIMATION_SPEED = 0.08;
const RALLY_PULSE_DURATION = 1000; // ms for one pulse cycle
const RALLY_PULSE_START_RADIUS = 10;

// New Ripple Effect Constants
const RIPPLE_RING_COUNT = 3;
const RIPPLE_START_RADIUS_FACTOR = 1.8; // Multiplier for base start radius
const RIPPLE_RING_SPACING_FACTOR = 0.3;
const RIPPLE_LINE_WIDTH = 2; // Increased line width for boldness
// New constants for staggered/dotted rings
const RIPPLE_RING_DELAY_FACTOR = 0.15; // Delay between rings starting (fraction of total duration)
const RIPPLE_DASH_PATTERN = [4, 4];   // Dashes for the rings
const RIPPLE_ROTATION_SPEED = 0.06;  // Speed for rotating ring dashes
const A_MOVE_MARKER_COLOR = 'hsl(0, 0%, 100%)'; // White for A-Move
const A_MOVE_RIPPLE_RING_COUNT = 5; // More rings for A-Move

// New Selection Animation Constants
const SELECTION_DASH_PATTERN = [10, 5]; // Longer dash
const SELECTION_ANIMATION_SPEED = 0.1; // Faster animation
const SELECTION_LINE_WIDTH_UNIT = 3; // Thicker for units
const SELECTION_LINE_WIDTH_BUNKER = 4; // Thicker for bunkers
const SELECTION_GLOW_COLOR = 'rgba(255, 255, 255, 0.3)'; // Add glow behind selection

// New Health Bar Constants
const HEALTHBAR_UNIT_WIDTH = 30;
const HEALTHBAR_UNIT_HEIGHT = 5;
const HEALTHBAR_UNIT_OFFSET_Y = 8; // Distance above unit center
const HEALTHBAR_BUNKER_WIDTH = 50;
const HEALTHBAR_BUNKER_HEIGHT = 6;
const HEALTHBAR_BUNKER_OFFSET_Y = 12; // Distance above bunker center
const HEALTHBAR_BACKGROUND_COLOR = '#444444';
const HEALTHBAR_BORDER_COLOR = '#111111';
const HEALTHBAR_DIVIDER_COLOR = '#111111';
const HEALTHBAR_BORDER_WIDTH = 1;

// Resource and Supply System
const resourceIncomeRate = 5; // Resources per second
let lastResourceUpdateTime = 0;
const resourceUpdateInterval = 1000; // Update resources every second
const maxSupplyCap = 10; // Maximum supply cap

// Resource gain constants
const RESOURCE_TEXT_DURATION = 1000; // Duration in ms for resource text animation
const RESOURCE_TEXT_SPEED = 0.5; // Speed at which resource text floats upward
const RESOURCE_TEXT_FONT_UNIT = '20px Arial'; // Font for unit kills (increased size)
const RESOURCE_TEXT_FONT_BUILDING = '28px Arial'; // Font for building kills (increased size)
const RESOURCE_GAIN_UNIT = 5; // Resources gained from killing a unit
const RESOURCE_GAIN_BUNKER = 25; // Resources gained from killing a bunker
const RESOURCE_GAIN_SUPPLY_DEPOT = 15; // Resources gained from killing a supply depot
const RESOURCE_GAIN_TOWER = 5; // Resources gained from killing a tower

// Upgrade System
const upgradeBasePrice = 25; // Base price for upgrades
const upgradeTypes = {
    ARMOR: 'armor',
    ATTACK_DAMAGE: 'attackDamage',
    WEAPON_RANGE: 'weaponRange',
    HEALTH_REGEN: 'healthRegen',
    MOVEMENT_SPEED: 'movementSpeed'
};

// Store player upgrades
const playerUpgrades = {
    1: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0 },
    2: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0 },
    3: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0 },
    4: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0 },
    5: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0 },
    6: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0 },
    7: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0 },
    8: { armor: 0, attackDamage: 0, weaponRange: 0, healthRegen: 0, movementSpeed: 0 }
};

// Function to calculate upgrade price based on current level
function getUpgradePrice(upgradeLevel) {
    return upgradeBasePrice * (upgradeLevel + 1);
}

// Function to apply upgrade effects to a unit
function applyUpgradesToUnit(unit) {
    if (!unit || !unit.playerId) return;

    const upgrades = playerUpgrades[unit.playerId];
    if (!upgrades) return;

    // Apply armor upgrade (each level adds 1 armor)
    unit.armor = unit.baseArmor + upgrades.armor;

    // Apply attack damage upgrade (each level adds 2 damage)
    unit.attackDamage = unit.baseAttackDamage + (upgrades.attackDamage * 2);

    // Apply weapon range upgrade (each level adds 20 range)
    unit.attackRange = unit.baseAttackRange + (upgrades.weaponRange * 20);

    // Apply health regen upgrade (each level adds 0.2 regen)
    unit.hpRegen = unit.baseHpRegen + (upgrades.healthRegen * 0.2);

    // Apply movement speed upgrade (each level adds 0.3 speed)
    unit.movementSpeed = unit.baseMovementSpeed + (upgrades.movementSpeed * 0.3);
}

// Store player-specific data including resources, supply, color, and team
const players = {
    // Team 1 (Red)
    1: { team: 1, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(0, 75%, 65%)' },    // Light red
    2: { team: 1, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(0, 75%, 40%)' },    // Dark red

    // Team 2 (Blue)
    3: { team: 2, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(210, 75%, 65%)' },  // Light blue
    4: { team: 2, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(210, 75%, 40%)' },  // Dark blue

    // Team 3 (Green)
    5: { team: 3, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(120, 75%, 60%)' },  // Light green
    6: { team: 3, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(120, 75%, 35%)' },  // Dark green

    // Team 4 (Brown)
    7: { team: 4, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(30, 70%, 60%)' },   // Light brown
    8: { team: 4, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(30, 70%, 35%)' }    // Dark brown
};

// Team information
const teams = {
    1: { name: "Red", color: 'hsl(0, 75%, 50%)' },
    2: { name: "Blue", color: 'hsl(210, 75%, 50%)' },
    3: { name: "Green", color: 'hsl(120, 75%, 45%)' },
    4: { name: "Brown", color: 'hsl(30, 70%, 45%)' }
};

// Performance Monitor State
let isPerformanceMonitorVisible = false;
let lastFrameTime = performance.now();
let frameTimes = [];
let lastPerformanceUpdate = 0;

// Performance Monitor Elements
const performanceMonitor = document.getElementById('performanceMonitor');
const fpsCounter = document.getElementById('fpsCounter');
const frameTimeElement = document.getElementById('frameTime');
const memoryUsageElement = document.getElementById('memoryUsage');

// Player Controls State
let isPlayerControlsVisible = false; // Start with player controls hidden
const playerControls = document.getElementById('playerControls');

// UI System
let uiSystem;

// Camera state
const camera = {
    x: MAP_WIDTH / 2 - window.innerWidth / 2, // Start centered
    y: MAP_HEIGHT / 2 - window.innerHeight / 2,
    velX: 0,
    velY: 0,
    update: function() {
        // Update camera position based on velocity
        this.x += this.velX;
        this.y += this.velY;

        // Constrain camera to visual map boundaries (extended area)
        // The visual boundaries start at -VISUAL_BOUNDARY_EXTENSION
        this.x = Math.max(-VISUAL_BOUNDARY_EXTENSION, Math.min(this.x, MAP_WIDTH + VISUAL_BOUNDARY_EXTENSION - canvas.width));
        this.y = Math.max(-VISUAL_BOUNDARY_EXTENSION, Math.min(this.y, MAP_HEIGHT + VISUAL_BOUNDARY_EXTENSION - canvas.height));
    }
};

// Coordinate conversion functions
function worldToScreen(worldX, worldY) {
    return {
        x: worldX - camera.x,
        y: worldY - camera.y
    };
}

function screenToWorld(screenX, screenY) {
    return {
        x: screenX + camera.x,
        y: screenY + camera.y
    };
}

// Convert world coordinates to grid coordinates
function worldToGrid(worldX, worldY) {
    // First determine which tile this is in
    const tileX = Math.floor(worldX / TILE_WIDTH);
    const tileY = Math.floor(worldY / TILE_HEIGHT);

    // Calculate position within the tile
    const tileRelativeX = worldX - tileX * TILE_WIDTH;
    const tileRelativeY = worldY - tileY * TILE_HEIGHT;

    // Calculate position relative to the inner area
    const innerRelativeX = tileRelativeX - INNER_TILE_OFFSET_X;
    const innerRelativeY = tileRelativeY - INNER_TILE_OFFSET_Y;

    // Check if the position is within the inner area of the tile
    const isInInnerArea =
        innerRelativeX >= 0 &&
        innerRelativeX < ADJUSTED_INNER_TILE_WIDTH &&
        innerRelativeY >= 0 &&
        innerRelativeY < ADJUSTED_INNER_TILE_HEIGHT;

    // Calculate which grid cell within the inner area
    let gridXInTile, gridYInTile;

    if (isInInnerArea) {
        // If inside the inner area, calculate the exact grid cell
        gridXInTile = Math.floor(innerRelativeX / GRID_CELL_WIDTH);
        gridYInTile = Math.floor(innerRelativeY / GRID_CELL_HEIGHT);
    } else {
        // If outside, find the closest grid cell in the inner area
        // Clamp innerRelativeX/Y to the inner area boundaries
        const clampedInnerX = Math.max(0, Math.min(innerRelativeX, ADJUSTED_INNER_TILE_WIDTH - 1));
        const clampedInnerY = Math.max(0, Math.min(innerRelativeY, ADJUSTED_INNER_TILE_HEIGHT - 1));

        gridXInTile = Math.floor(clampedInnerX / GRID_CELL_WIDTH);
        gridYInTile = Math.floor(clampedInnerY / GRID_CELL_HEIGHT);
    }

    // Ensure grid coordinates are within valid range
    gridXInTile = Math.max(0, Math.min(gridXInTile, GRID_CELLS_PER_TILE - 1));
    gridYInTile = Math.max(0, Math.min(gridYInTile, GRID_CELLS_PER_TILE - 1));

    // Calculate global grid coordinates
    const gridX = tileX * GRID_CELLS_PER_TILE + gridXInTile;
    const gridY = tileY * GRID_CELLS_PER_TILE + gridYInTile;

    return {
        gridX,
        gridY,
        tileX,
        tileY,
        gridXInTile,
        gridYInTile,
        isInInnerArea
    };
}

// Convert grid coordinates to world coordinates (center of grid cell)
function gridToWorld(gridX, gridY) {
    // Calculate which tile this grid cell is in
    const tileX = Math.floor(gridX / GRID_CELLS_PER_TILE);
    const tileY = Math.floor(gridY / GRID_CELLS_PER_TILE);

    // Calculate grid position within the tile
    const gridXInTile = gridX % GRID_CELLS_PER_TILE;
    const gridYInTile = gridY % GRID_CELLS_PER_TILE;

    // Calculate world coordinates (center of the grid cell)
    // Start with the tile position
    const tileWorldX = tileX * TILE_WIDTH;
    const tileWorldY = tileY * TILE_HEIGHT;

    // Add the offset to the inner area
    const innerAreaX = tileWorldX + INNER_TILE_OFFSET_X;
    const innerAreaY = tileWorldY + INNER_TILE_OFFSET_Y;

    // Add the position within the inner grid
    const worldX = innerAreaX + gridXInTile * GRID_CELL_WIDTH + GRID_CELL_WIDTH / 2;
    const worldY = innerAreaY + gridYInTile * GRID_CELL_HEIGHT + GRID_CELL_HEIGHT / 2;

    return { x: worldX, y: worldY };
}

// Function to check if a point is within the map boundaries
function isWithinMapBoundaries(x, y) {
    return x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT;
}

// Function to check if a building placement is valid
function isValidBuildingPlacement(gridX, gridY, buildingType) {
    if (!buildingType || !BUILDING_GRID_SIZES[buildingType]) return false;

    const { width, height } = BUILDING_GRID_SIZES[buildingType];

    // Get the tile this grid cell belongs to
    const tileX = Math.floor(gridX / GRID_CELLS_PER_TILE);
    const tileY = Math.floor(gridY / GRID_CELLS_PER_TILE);

    // Check if the building stays within the 4x4 grid of this tile
    // This ensures buildings don't cross tile boundaries
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cellGridX = gridX + x;
            const cellGridY = gridY + y;

            // Calculate which tile this cell belongs to
            const cellTileX = Math.floor(cellGridX / GRID_CELLS_PER_TILE);
            const cellTileY = Math.floor(cellGridY / GRID_CELLS_PER_TILE);

            // If the cell is in a different tile, the placement is invalid
            if (cellTileX !== tileX || cellTileY !== tileY) {
                return false;
            }

            // Check if the cell is within the 4x4 grid
            const gridXInTile = cellGridX % GRID_CELLS_PER_TILE;
            const gridYInTile = cellGridY % GRID_CELLS_PER_TILE;

            if (gridXInTile >= GRID_CELLS_PER_TILE || gridYInTile >= GRID_CELLS_PER_TILE) {
                return false;
            }
        }
    }

    // Check if the building is within map boundaries
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const worldPos = gridToWorld(gridX + x, gridY + y);
            if (!isWithinMapBoundaries(worldPos.x, worldPos.y)) {
                return false;
            }
        }
    }

    // Check if the building overlaps with any existing buildings
    // We'll create a set of occupied grid cells
    const occupiedGridCells = new Set();

    // First, mark all grid cells occupied by existing buildings
    for (const obj of gameObjects) {
        if ((obj.type === 'bunker' || obj.type === 'supplyDepot' ||
             obj.type === 'shieldTower' || obj.type === 'sensorTower') &&
             obj.health > 0) {

            // If the building has stored grid coordinates, use those
            if (obj.gridX !== undefined && obj.gridY !== undefined &&
                obj.gridWidth !== undefined && obj.gridHeight !== undefined) {

                // Mark all grid cells occupied by this building
                for (let y = 0; y < obj.gridHeight; y++) {
                    for (let x = 0; x < obj.gridWidth; x++) {
                        const cellKey = `${obj.gridX + x},${obj.gridY + y}`;
                        occupiedGridCells.add(cellKey);
                    }
                }
            } else {
                // Fallback for older buildings without grid info
                // Determine building size based on type
                let objWidth = 1;
                let objHeight = 1;

                if (obj.type === 'bunker') {
                    objWidth = BUILDING_GRID_SIZES.bunker.width;
                    objHeight = BUILDING_GRID_SIZES.bunker.height;
                } else if (obj.type === 'supplyDepot') {
                    objWidth = BUILDING_GRID_SIZES.supplyDepot.width;
                    objHeight = BUILDING_GRID_SIZES.supplyDepot.height;
                } else if (obj.type === 'shieldTower') {
                    objWidth = BUILDING_GRID_SIZES.shieldTower.width;
                    objHeight = BUILDING_GRID_SIZES.shieldTower.height;
                } else if (obj.type === 'sensorTower') {
                    objWidth = BUILDING_GRID_SIZES.sensorTower.width;
                    objHeight = BUILDING_GRID_SIZES.sensorTower.height;
                }

                // Convert building position to grid coordinates
                const objGridPos = worldToGrid(obj.x, obj.y);

                // Calculate the top-left grid cell of the building
                const objBaseGridX = objGridPos.gridX - Math.floor(objWidth / 2);
                const objBaseGridY = objGridPos.gridY - Math.floor(objHeight / 2);

                // Mark all grid cells occupied by this building
                for (let y = 0; y < objHeight; y++) {
                    for (let x = 0; x < objWidth; x++) {
                        const cellKey = `${objBaseGridX + x},${objBaseGridY + y}`;
                        occupiedGridCells.add(cellKey);
                    }
                }
            }
        }
    }

    // Now check if any of the cells we want to place on are occupied
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cellKey = `${gridX + x},${gridY + y}`;
            if (occupiedGridCells.has(cellKey)) {
                return false; // Cell is already occupied
            }
        }
    }

    return true;
}

// --- Helper Functions (Add Color Helper) ---
function getDarkerHslColor(hslColor, reduction = 20) {
    // Simple parsing assuming "hsl(H, S%, L%)" format
    const parts = hslColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!parts) return '#000000'; // Fallback

    const h = parseInt(parts[1]);
    const s = parseInt(parts[2]);
    let l = parseInt(parts[3]);

    l = Math.max(0, l - reduction); // Reduce lightness, clamp at 0

    return `hsl(${h}, ${s}%, ${l}%)`;
}

// --- New Health Bar Helper Functions ---
function getHealthBasedColor(baseHslColor, healthRatio) {
    const parts = baseHslColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!parts) return '#CCCCCC'; // Fallback grey

    const h = parseInt(parts[1]);
    let s = parseInt(parts[2]);
    let l = parseInt(parts[3]);

    // Adjust Lightness and Saturation based on health
    // Full health: original L, S
    // Low health: Lower L, slightly lower S
    // Lerp (linear interpolation)
    const minL = Math.max(0, l - 25); // Don't go too dark
    const minS = Math.max(0, s - 30); // Reduce saturation slightly

    const currentL = minL + (l - minL) * healthRatio;
    const currentS = minS + (s - minS) * healthRatio;

    return `hsl(${h}, ${Math.round(currentS)}%, ${Math.round(currentL)}%)`;
}

function drawHealthBar(ctx, worldX, worldY, currentHealth, maxHealth, width, height, basePlayerColor) {
    if (currentHealth <= 0) return; // Don't draw if dead

    // Convert world position to screen position
    const screenPos = worldToScreen(worldX, worldY);

    // Skip if offscreen
    if (screenPos.x < -width ||
        screenPos.x > canvas.width + width ||
        screenPos.y < -height ||
        screenPos.y > canvas.height + height) {
        return;
    }

    const healthRatio = Math.max(0, currentHealth / maxHealth);
    const barX = screenPos.x - width / 2;
    const barY = screenPos.y - height; // Adjust Y based on top coordinate

    // 1. Get dynamic fill color
    const fillColor = getHealthBasedColor(basePlayerColor, healthRatio);

    // Save context state
    const originalFill = ctx.fillStyle;
    const originalStroke = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;

    // 2. Draw Background
    ctx.fillStyle = HEALTHBAR_BACKGROUND_COLOR;
    ctx.fillRect(barX, barY, width, height);

    // 3. Draw Filled Portion
    ctx.fillStyle = fillColor;
    const filledWidth = width * healthRatio;
    ctx.fillRect(barX, barY, filledWidth, height);

    // 4. Draw Dividers
    ctx.strokeStyle = HEALTHBAR_DIVIDER_COLOR;
    ctx.lineWidth = HEALTHBAR_BORDER_WIDTH; // Use border width for dividers too
    const thirdWidth = width / 3;
    // Line 1 (1/3)
    ctx.beginPath();
    ctx.moveTo(barX + thirdWidth, barY);
    ctx.lineTo(barX + thirdWidth, barY + height);
    ctx.stroke();
    // Line 2 (2/3)
    ctx.beginPath();
    ctx.moveTo(barX + 2 * thirdWidth, barY);
    ctx.lineTo(barX + 2 * thirdWidth, barY + height);
    ctx.stroke();

    // 5. Draw Border
    ctx.strokeStyle = HEALTHBAR_BORDER_COLOR;
    ctx.lineWidth = HEALTHBAR_BORDER_WIDTH;
    ctx.strokeRect(barX, barY, width, height);

    // Restore context state
    ctx.fillStyle = originalFill;
    ctx.strokeStyle = originalStroke;
    ctx.lineWidth = originalLineWidth;
}

// --- GameObject Class ---
class GameObject {
    constructor(x, y, playerId, size, stats = {}) {
        this.id = `${this.constructor.name}_${playerId}_${Math.random().toString(16).slice(2)}`;
        this.x = x;
        this.y = y;
        this.size = size;
        this.playerId = playerId;
        this.color = players[playerId].color;

        // Core stats with defaults
        this.maxHealth = stats.maxHealth || 100;
        this.health = this.maxHealth;
        this.armor = stats.armor || 0;
        this.attackDamage = stats.attackDamage || 0;
        this.attackSpeed = stats.attackSpeed || 1;
        this.attackRange = stats.attackRange || 0;
        this.hpRegen = stats.hpRegen || 0;
        this.visionRange = stats.visionRange || 200;
        this.supplyCost = stats.supplyCost || 0;

        // Combat timing
        this.attackCooldown = 1000 / this.attackSpeed;
        this.lastAttackTime = 0;
        this.lastRegenTime = 0;

        // Shield bonus from shield towers
        this.shieldBonus = 0;
    }

    takeDamage(damage) {
        // Calculate total armor including shield bonus
        const totalArmor = this.armor + (this.shieldBonus || 0);
        const actualDamage = Math.max(1, damage - totalArmor);
        this.health = Math.max(0, this.health - actualDamage);
        return this.health <= 0;
    }

    update(now, gameObjects) {
        if (this.health <= 0) return;

        // Handle HP regeneration
        if (this.hpRegen > 0) {
            const regenInterval = 1000; // Regen tick every second
            if (now - this.lastRegenTime >= regenInterval) {
                this.health = Math.min(this.maxHealth, this.health + this.hpRegen);
                this.lastRegenTime = now;
            }
        }

        // Apply upgrades if this is the first update
        if (this.firstUpdate === undefined) {
            this.firstUpdate = true;
            if (this.type === 'marine' || this.type === 'worker') {
                applyUpgradesToUnit(this);
            }
        }
    }

    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (
            pointX >= this.x - halfSize &&
            pointX <= this.x + halfSize &&
            pointY >= this.y - halfSize &&
            pointY <= this.y + halfSize
        );
    }

    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];

        return [{
            type: 'healthBar',
            centerX: this.x,
            topY: this.y - this.size/2 - HEALTHBAR_UNIT_OFFSET_Y,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_UNIT_WIDTH,
            height: HEALTHBAR_UNIT_HEIGHT,
            basePlayerColor: this.color
        }];
    }
}

// --- FloatingText Class ---
class FloatingText {
    constructor(x, y, text, color, font, duration) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.font = font;
        this.duration = duration;
        this.startTime = performance.now();
        this.opacity = 1.0;
    }

    update(now) {
        // Calculate progress (0 to 1)
        const elapsed = now - this.startTime;
        const progress = Math.min(1.0, elapsed / this.duration);

        // Update position (float upward)
        this.y -= RESOURCE_TEXT_SPEED;

        // Update opacity (fade out)
        this.opacity = 1.0 - progress;

        // Return true if still active, false if expired
        return progress < 1.0;
    }

    draw(ctx) {
        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Skip if offscreen
        if (screenPos.x < 0 || screenPos.x > canvas.width ||
            screenPos.y < 0 || screenPos.y > canvas.height) {
            return;
        }

        // Draw text with current opacity
        ctx.font = this.font;
        ctx.textAlign = 'center';

        // Handle HSL color format from player colors
        if (this.color.startsWith('hsl')) {
            ctx.fillStyle = this.color.replace('hsl', 'hsla').replace(')', `, ${this.opacity})`);
        } else {
            // Handle RGB or other color formats
            ctx.fillStyle = this.color.replace(')', `, ${this.opacity})`).replace('rgb', 'rgba');
        }

        // Add text shadow for better visibility
        ctx.shadowColor = 'rgba(0, 0, 0, ' + this.opacity * 0.7 + ')';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;

        // Draw the text
        ctx.fillText(this.text, screenPos.x, screenPos.y);

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    }
}

// --- Building Classes ---

// --- Bunker Class ---
class Bunker extends GameObject {
    constructor(x, y, playerId, isUnderConstruction = false) {
        const bunkerStats = {
            maxHealth: 500,
            armor: 3,
            attackDamage: 0,
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 1,
            visionRange: 300,
            supplyCost: 0
        };

        // Size based on grid cells (3x3)
        const width = GRID_CELL_WIDTH * 3;
        const height = GRID_CELL_HEIGHT * 3;
        const size = Math.max(width, height);
        super(x, y, playerId, size, bunkerStats);

        // Store actual width and height for drawing and click detection
        this.width = width;
        this.height = height;

        // Store grid dimensions for placement validation
        this.gridWidth = 3;
        this.gridHeight = 3;

        // Bunker-specific properties
        this.type = 'bunker';
        this.rallyPoint = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
        this.spawnCooldown = BUNKER_SPAWN_COOLDOWN;
        this.lastSpawnTime = 0;
        this.supplyBonus = BUNKER_SUPPLY_BONUS;

        // Construction state
        this.isUnderConstruction = isUnderConstruction;
        this.constructionProgress = 0; // 0 to 1

        // Only add supply bonus when construction is complete
        if (!isUnderConstruction && players[playerId]) {
            players[playerId].supplyCap += this.supplyBonus;
            console.log(`Player ${playerId} supply cap increased to ${players[playerId].supplyCap}`);
        }
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if the bunker is visible on screen
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        if (screenPos.x + halfWidth < 0 ||
            screenPos.x - halfWidth > canvas.width ||
            screenPos.y + halfHeight < 0 ||
            screenPos.y - halfHeight > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfWidth;
        const drawY = screenPos.y - halfHeight;

        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(drawX + 4, drawY + 4, this.width, this.height);

        // Draw Bunker Body
        if (this.isUnderConstruction) {
            // Semi-transparent color for under construction
            const constructionColor = this.color.replace('hsl', 'hsla').replace(')', ', 0.6)');
            ctx.fillStyle = constructionColor;
        } else {
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(drawX, drawY, this.width, this.height);

        // Add inner highlight for 3D effect
        const highlightColor = this.color.replace('hsl', 'hsla').replace(')', ', 0.7)');
        ctx.fillStyle = highlightColor;
        ctx.fillRect(drawX + 5, drawY + 5, this.width - 10, this.height - 10);

        // Draw Darker Border
        ctx.strokeStyle = getDarkerHslColor(this.color, 15);
        ctx.lineWidth = 3; // Increased bunker border thickness
        ctx.strokeRect(drawX, drawY, this.width, this.height);

        // Draw construction progress if under construction
        if (this.isUnderConstruction) {
            // Draw a pulsing outline to indicate it can be clicked to resume construction
            const now = performance.now();
            const pulseIntensity = 0.5 + 0.5 * Math.sin(now * 0.003); // Pulsing effect

            ctx.strokeStyle = `rgba(255, 255, 255, ${pulseIntensity})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(drawX - 5, drawY - 5, this.width + 10, this.height + 10);
            ctx.setLineDash([]);

            // Draw construction progress bar
            const barWidth = this.width * 0.8;
            const barHeight = 8;
            const barX = screenPos.x - barWidth / 2;
            const barY = screenPos.y - halfHeight - 15;

            // Draw background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Draw progress
            ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth * this.constructionProgress, barHeight);

            // Draw border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);

            // Draw construction scaffolding/pattern for 3x3 grid
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);

            // Horizontal lines - 2 internal lines for 3x3 grid
            const horizontalSpacing = this.size / 3;
            for (let i = 1; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(drawX, drawY + i * horizontalSpacing);
                ctx.lineTo(drawX + this.size, drawY + i * horizontalSpacing);
                ctx.stroke();
            }

            // Vertical lines - 2 internal lines for 3x3 grid
            const verticalSpacing = this.size / 3;
            for (let i = 1; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(drawX + i * verticalSpacing, drawY);
                ctx.lineTo(drawX + i * verticalSpacing, drawY + this.size);
                ctx.stroke();
            }

            ctx.setLineDash([]);
        }

        // Draw directional triangle pointing toward rally point
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

        // Calculate direction to rally point
        const dx = this.rallyPoint.x - this.x;
        const dy = this.rallyPoint.y - this.y;
        const angle = Math.atan2(dy, dx);

        // Draw triangle pointing in rally direction
        const triangleSize = Math.min(halfWidth, halfHeight) * 0.7;
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(triangleSize, 0);
        ctx.lineTo(-triangleSize/2, -triangleSize/2);
        ctx.lineTo(-triangleSize/2, triangleSize/2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // --- Draw Animated Selection --- (Modified)
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state we are about to change
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 6;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(
                drawX - padding,
                drawY - padding,
                this.width + padding * 2,
                this.height + padding * 2
            );

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_BUNKER; // Use new thickness
            ctx.setLineDash(SELECTION_DASH_PATTERN); // Apply dash pattern
            ctx.lineDashOffset = dashOffset; // Apply animation offset

            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.width + padding * 2,
                this.height + padding * 2
            );

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];

        const commands = [];
        const now = performance.now(); // Needed for animations
        const halfHeight = this.height / 2;

        // --- Generate Health Bar Command --- Changed from text
        commands.push({
            type: 'healthBar',
            centerX: this.x,
            topY: this.y - halfHeight - HEALTHBAR_BUNKER_OFFSET_Y,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_BUNKER_WIDTH,
            height: HEALTHBAR_BUNKER_HEIGHT,
            basePlayerColor: this.color // Pass player color
        });
        /* Original Text Health:
        commands.push({
            type: 'text',
            content: this.health,
            x: this.x,
            y: this.y - halfSize - 8,
            color: HEALTH_BAR_COLOR,
            font: BUNKER_HEALTH_FONT,
            textAlign: 'center'
        });
        */

        if (isSelected && this.playerId === currentPlayerId) {
            const lineDashOffset = -(now * RALLY_LINE_ANIMATION_SPEED) % (RALLY_LINE_DASH_PATTERN[0] + RALLY_LINE_DASH_PATTERN[1]);

            commands.push({
                type: 'rally',
                startX: this.x,
                startY: this.y,
                endX: this.rallyPoint.x,
                endY: this.rallyPoint.y,
                color: this.color,
                playerId: this.playerId,
                lineWidth: 1,
                lineDash: RALLY_LINE_DASH_PATTERN,
                lineDashOffset: lineDashOffset,
                pulseDuration: RALLY_PULSE_DURATION,
                rippleStartRadius: RALLY_PULSE_START_RADIUS
            });
        }

        return commands;
    }

    update(now, allGameObjects, playersState) {
        if (this.health <= 0) return;
        const playerState = playersState[this.playerId];
        if (!playerState) {
            console.error(`Bunker ${this.id} could not find playerState for player ${this.playerId}`);
            return;
        }

        const timeSinceLastSpawn = now - this.lastSpawnTime;
        if (timeSinceLastSpawn >= this.spawnCooldown) {
            console.log(`Bunker ${this.id} ready to spawn (cooldown met).`);
            if (playerState.currentSupply < playerState.supplyCap) {
                console.log(`Bunker ${this.id} supply ok (${playerState.currentSupply}/${playerState.supplyCap}). Attempting spawn.`);
                // Calculate direction vector from bunker to rally point
                const dx = this.rallyPoint.x - this.x;
                const dy = this.rallyPoint.y - this.y;

                // Calculate distance to normalize the direction vector
                const distance = Math.hypot(dx, dy);

                // Normalize the direction vector (handle case where rally point is at bunker position)
                let dirX = distance > 0 ? dx / distance : 1;
                let dirY = distance > 0 ? dy / distance : 0;

                // Calculate initial angle from bunker to rally point
                let angle = Math.atan2(dirY, dirX);

                // Define spawn offset distance
                const spawnOffset = this.width / 2 + 20;

                // Try different angles in 45-degree increments if blocked
                let spawnX, spawnY;
                let blocked = true;
                let attempts = 0;
                const maxAttempts = 8; // 8 directions (360 degrees in 45-degree increments)

                while (blocked && attempts < maxAttempts) {
                    // Calculate spawn position using the current angle
                    dirX = Math.cos(angle);
                    dirY = Math.sin(angle);
                    spawnX = this.x + dirX * spawnOffset;
                    spawnY = this.y + dirY * spawnOffset;

                    console.log(`Bunker ${this.id} trying spawn point at angle ${(angle * 180 / Math.PI).toFixed(1)}°: (${spawnX.toFixed(1)}, ${spawnY.toFixed(1)})`);

                    // Check if this position is blocked
                    blocked = false;
                    for (const obj of allGameObjects) {
                        if (obj.health > 0 && Math.hypot(obj.x - spawnX, obj.y - spawnY) < (obj.size / 2 + 15)) {
                            console.log(`Bunker ${this.id} spawn blocked by object ${obj.id} at (${obj.x.toFixed(1)}, ${obj.y.toFixed(1)})`);
                            blocked = true;
                            break;
                        }
                    }

                    if (blocked) {
                        // Rotate 45 degrees clockwise for next attempt
                        angle += Math.PI / 4;
                        attempts++;
                    }
                }

                // If all positions are blocked, skip this spawn cycle
                if (blocked) {
                    console.log(`Bunker ${this.id} all spawn positions blocked, skipping spawn cycle`);
                    this.lastSpawnTime = now;
                    return;
                }

                console.log(`Bunker ${this.id} found unblocked spawn point at attempt ${attempts+1}: (${spawnX.toFixed(1)}, ${spawnY.toFixed(1)})`);

                // Spawn the marine at the unblocked position
                console.log(`Bunker ${this.id} SPAWNING MARINE!`);
                const newMarine = new Marine(spawnX, spawnY, this.playerId);
                allGameObjects.push(newMarine);
                playerState.currentSupply += newMarine.supplyCost;
                newMarine.attackMoveTo(this.rallyPoint.x, this.rallyPoint.y);
                this.lastSpawnTime = now;
                console.log(`Player ${this.playerId} spawned marine. Supply: ${playerState.currentSupply}/${playerState.supplyCap}`);
                return;
            } else {
                 console.log(`Bunker ${this.id} cannot spawn: supply capped (${playerState.currentSupply}/${playerState.supplyCap}).`);
            }
            this.lastSpawnTime = now;
        }
    }

    isUnderPoint(pointX, pointY) {
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        return (pointX >= this.x - halfWidth && pointX <= this.x + halfWidth &&
                pointY >= this.y - halfHeight && pointY <= this.y + halfHeight);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Supply Depot Class ---
class SupplyDepot extends GameObject {
    constructor(x, y, playerId, isUnderConstruction = false) {
        const supplyDepotStats = {
            maxHealth: 400,
            armor: 2,
            attackDamage: 0,
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 0.5,
            visionRange: 250,
            supplyCost: 0
        };

        // Size based on grid cells (3x2)
        const width = GRID_CELL_WIDTH * 3;
        const height = GRID_CELL_HEIGHT * 2;
        // Use max size for collision detection, but store actual width and height
        const size = Math.max(width, height);
        super(x, y, playerId, size, supplyDepotStats);

        // Store actual width and height for drawing
        this.width = width;
        this.height = height;

        // Store grid dimensions for placement validation
        this.gridWidth = 3;
        this.gridHeight = 2;

        // Calculate and store grid coordinates
        const gridPos = worldToGrid(x, y);
        this.gridX = gridPos.gridX - Math.floor(this.gridWidth / 2);
        this.gridY = gridPos.gridY - Math.floor(this.gridHeight / 2);

        // Supply Depot specific properties
        this.type = 'supplyDepot';
        this.supplyBonus = SUPPLY_DEPOT_SUPPLY_BONUS;

        // Construction state
        this.isUnderConstruction = isUnderConstruction;
        this.constructionProgress = 0; // 0 to 1

        // Only add supply bonus when construction is complete
        if (!isUnderConstruction && players[playerId]) {
            players[playerId].supplyCap += this.supplyBonus;
            console.log(`Player ${playerId} supply cap increased to ${players[playerId].supplyCap}`);
        }
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Calculate half width and height for the rectangular shape
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;

        // Check if visible on screen
        if (screenPos.x + halfWidth < 0 ||
            screenPos.x - halfWidth > canvas.width ||
            screenPos.y + halfHeight < 0 ||
            screenPos.y - halfHeight > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfWidth;
        const drawY = screenPos.y - halfHeight;

        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(drawX + 4, drawY + 4, this.width, this.height);

        // Draw Supply Depot Body
        if (this.isUnderConstruction) {
            // Semi-transparent color for under construction
            const constructionColor = this.color.replace('hsl', 'hsla').replace(')', ', 0.6)');
            ctx.fillStyle = constructionColor;
        } else {
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(drawX, drawY, this.width, this.height);

        // Draw supply symbol (S)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S', screenPos.x, screenPos.y);

        // Draw Darker Border
        ctx.strokeStyle = getDarkerHslColor(this.color, 15);
        ctx.lineWidth = 3;
        ctx.strokeRect(drawX, drawY, this.width, this.height);

        // Draw construction progress if under construction
        if (this.isUnderConstruction) {
            // Draw a pulsing outline to indicate it can be clicked to resume construction
            const now = performance.now();
            const pulseIntensity = 0.5 + 0.5 * Math.sin(now * 0.003); // Pulsing effect

            ctx.strokeStyle = `rgba(255, 255, 255, ${pulseIntensity})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(drawX - 5, drawY - 5, this.width + 10, this.height + 10);
            ctx.setLineDash([]);

            // Draw construction progress bar
            const barWidth = this.width * 0.8;
            const barHeight = 8;
            const barX = screenPos.x - barWidth / 2;
            const barY = screenPos.y - halfHeight - 15;

            // Draw background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Draw progress
            ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth * this.constructionProgress, barHeight);

            // Draw border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);

            // Draw construction scaffolding/pattern for 3x2 grid
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);

            // Horizontal lines - 1 internal line for 3x2 grid
            const horizontalLineSpacing = this.height / 2;
            ctx.beginPath();
            ctx.moveTo(drawX, drawY + horizontalLineSpacing);
            ctx.lineTo(drawX + this.width, drawY + horizontalLineSpacing);
            ctx.stroke();

            // Vertical lines - 2 internal lines for 3x2 grid
            const verticalLineSpacing = this.width / 3;
            for (let i = 1; i < 3; i++) {
                ctx.beginPath();
                ctx.moveTo(drawX + i * verticalLineSpacing, drawY);
                ctx.lineTo(drawX + i * verticalLineSpacing, drawY + this.height);
                ctx.stroke();
            }

            ctx.setLineDash([]);
        }

        // Draw selection if selected
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 6;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(
                drawX - padding,
                drawY - padding,
                this.width + padding * 2,
                this.height + padding * 2
            );

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_BUNKER; // Use same thickness as bunker
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.width + padding * 2,
                this.height + padding * 2
            );

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];

        const commands = [];
        const halfHeight = this.height / 2;

        // Health Bar command
        commands.push({
            type: 'healthBar',
            centerX: this.x,
            topY: this.y - halfHeight - HEALTHBAR_BUNKER_OFFSET_Y,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_BUNKER_WIDTH,
            height: HEALTHBAR_BUNKER_HEIGHT,
            basePlayerColor: this.color
        });

        return commands;
    }

    isUnderPoint(pointX, pointY) {
        const halfWidth = this.width / 2;
        const halfHeight = this.height / 2;
        return (pointX >= this.x - halfWidth && pointX <= this.x + halfWidth &&
                pointY >= this.y - halfHeight && pointY <= this.y + halfHeight);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Shield Tower Class ---
class ShieldTower extends GameObject {
    constructor(x, y, playerId, isUnderConstruction = false) {
        const shieldTowerStats = {
            maxHealth: 300,
            armor: 1,
            attackDamage: 0,
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 0.5,
            visionRange: 350,
            supplyCost: 0
        };

        // Size based on grid cells (1x1)
        const size = GRID_CELL_WIDTH * 1;
        super(x, y, playerId, size, shieldTowerStats);

        // Shield Tower specific properties
        this.type = 'shieldTower';
        this.shieldRadius = SHIELD_TOWER_RADIUS;
        this.armorBonus = SHIELD_TOWER_ARMOR_BONUS;

        // Construction state
        this.isUnderConstruction = isUnderConstruction;
        this.constructionProgress = 0; // 0 to 1
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if visible on screen
        const halfSize = this.size / 2;
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y - halfSize > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(drawX + 4, drawY + 4, this.size, this.size);

        // Draw Shield Tower Body (square instead of circle)
        if (this.isUnderConstruction) {
            // Semi-transparent color for under construction
            const constructionColor = this.color.replace('hsl', 'hsla').replace(')', ', 0.6)');
            ctx.fillStyle = constructionColor;
        } else {
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // Draw shield symbol
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⛨', screenPos.x, screenPos.y);

        // Draw Darker Border
        ctx.strokeStyle = getDarkerHslColor(this.color, 15);
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        // Draw shield aura field (square shape, always visible)
        if (!this.isUnderConstruction) {
            // Calculate the shield field size (1.5 tiles)
            const shieldFieldSize = this.shieldRadius * 2;
            const shieldFieldX = screenPos.x - this.shieldRadius;
            const shieldFieldY = screenPos.y - this.shieldRadius;

            // Draw semi-transparent shield field with player color
            ctx.fillStyle = this.color.replace(')', ', 0.15)').replace('hsl', 'hsla');
            ctx.fillRect(shieldFieldX, shieldFieldY, shieldFieldSize, shieldFieldSize);

            // Draw shield field border
            ctx.strokeStyle = this.color.replace(')', ', 0.3)').replace('hsl', 'hsla');
            ctx.lineWidth = 1;
            ctx.strokeRect(shieldFieldX, shieldFieldY, shieldFieldSize, shieldFieldSize);
        }

        // Draw construction progress if under construction
        if (this.isUnderConstruction) {
            // Draw a pulsing outline to indicate it can be clicked to resume construction
            const now = performance.now();
            const pulseIntensity = 0.5 + 0.5 * Math.sin(now * 0.003); // Pulsing effect

            ctx.strokeStyle = `rgba(255, 255, 255, ${pulseIntensity})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(drawX - 5, drawY - 5, this.size + 10, this.size + 10);
            ctx.setLineDash([]);

            // Draw construction progress bar
            const barWidth = this.size * 0.8;
            const barHeight = 8;
            const barX = screenPos.x - barWidth / 2;
            const barY = screenPos.y - halfSize - 15;

            // Draw background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Draw progress
            ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth * this.constructionProgress, barHeight);

            // Draw border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);

            // Draw construction scaffolding/pattern
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);

            // For 1x1 grid, no internal grid lines needed
            // Just draw a simple cross pattern to indicate construction
            ctx.beginPath();
            ctx.moveTo(drawX, drawY);
            ctx.lineTo(drawX + this.size, drawY + this.size);
            ctx.moveTo(drawX + this.size, drawY);
            ctx.lineTo(drawX, drawY + this.size);
            ctx.stroke();

            ctx.setLineDash([]);
        }

        // Draw shield radius when selected
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            // We no longer need to draw the shield radius here since it's always visible
            // Just keep the selection indicator

            // Draw selection
            const padding = 5;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, halfSize + padding, 0, Math.PI * 2);
            ctx.fill();

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT;
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, halfSize + padding, 0, Math.PI * 2);
            ctx.stroke();

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];

        const commands = [];
        const halfSize = this.size / 2;

        // Health Bar command
        commands.push({
            type: 'healthBar',
            centerX: this.x,
            topY: this.y - halfSize - HEALTHBAR_UNIT_OFFSET_Y,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_UNIT_WIDTH,
            height: HEALTHBAR_UNIT_HEIGHT,
            basePlayerColor: this.color
        });

        return commands;
    }

    update(now, allGameObjects) {
        super.update(now, allGameObjects);

        // Apply shield effect to nearby allied units
        if (this.health > 0) {
            allGameObjects.forEach(obj => {
                // Only apply to allied units that are alive
                if (obj.health > 0 && areAllies(this.playerId, obj.playerId) &&
                    (obj.type === 'marine' || obj.type === 'worker')) {

                    // Check if unit is within shield radius (square boundary check)
                    const dx = Math.abs(obj.x - this.x);
                    const dy = Math.abs(obj.y - this.y);

                    // Unit is within the square shield field if both dx and dy are less than shieldRadius
                    if (dx <= this.shieldRadius && dy <= this.shieldRadius) {
                        // Apply shield effect (temporary armor bonus)
                        obj.shieldBonus = this.armorBonus;
                    } else {
                        // Remove shield effect if unit moves out of range
                        obj.shieldBonus = 0;
                    }
                }
            });
        }
    }

    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (pointX >= this.x - halfSize && pointX <= this.x + halfSize &&
                pointY >= this.y - halfSize && pointY <= this.y + halfSize);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Sensor Tower Class ---
class SensorTower extends GameObject {
    constructor(x, y, playerId, isUnderConstruction = false) {
        const sensorTowerStats = {
            maxHealth: 200,
            armor: 0,
            attackDamage: 0,
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 0.5,
            visionRange: 500, // Extra vision range
            supplyCost: 0
        };

        // Size based on grid cells (1x1)
        const size = GRID_CELL_WIDTH * 1;
        super(x, y, playerId, size, sensorTowerStats);

        // Sensor Tower specific properties
        this.type = 'sensorTower';

        // Construction state
        this.isUnderConstruction = isUnderConstruction;
        this.constructionProgress = 0; // 0 to 1
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if visible on screen
        const halfSize = this.size / 2;
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y - halfSize > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // Draw shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(drawX + 4, drawY + 4, this.size, this.size);

        // Draw Sensor Tower Body (square instead of triangle)
        if (this.isUnderConstruction) {
            // Semi-transparent color for under construction
            const constructionColor = this.color.replace('hsl', 'hsla').replace(')', ', 0.6)');
            ctx.fillStyle = constructionColor;
        } else {
            ctx.fillStyle = this.color;
        }
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // Draw construction progress if under construction
        if (this.isUnderConstruction) {
            // Draw a pulsing outline to indicate it can be clicked to resume construction
            const now = performance.now();
            const pulseIntensity = 0.5 + 0.5 * Math.sin(now * 0.003); // Pulsing effect

            ctx.strokeStyle = `rgba(255, 255, 255, ${pulseIntensity})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            // Draw pulsing square outline for 1x1 grid
            ctx.strokeRect(drawX - 5, drawY - 5, this.size + 10, this.size + 10);
            ctx.setLineDash([]);

            // Draw construction progress bar
            const barWidth = this.size * 0.8;
            const barHeight = 8;
            const barX = screenPos.x - barWidth / 2;
            const barY = screenPos.y - halfSize - 15;

            // Draw background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Draw progress
            ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth * this.constructionProgress, barHeight);

            // Draw border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);

            // Draw construction scaffolding/pattern
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);

            // For 1x1 grid, no internal grid lines needed
            // Just draw a simple cross pattern to indicate construction
            ctx.beginPath();
            ctx.moveTo(drawX, drawY);
            ctx.lineTo(drawX + this.size, drawY + this.size);
            ctx.moveTo(drawX + this.size, drawY);
            ctx.lineTo(drawX, drawY + this.size);
            ctx.stroke();

            ctx.setLineDash([]);
        }

        // Draw radar symbol
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', screenPos.x, screenPos.y);

        // Draw Darker Border
        ctx.strokeStyle = getDarkerHslColor(this.color, 15);
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        // Draw selection if selected
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 5;

            // Draw selection glow for square shape
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT;
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        if (this.health <= 0) return [];

        const commands = [];
        const halfSize = this.size / 2;

        // Health Bar command
        commands.push({
            type: 'healthBar',
            centerX: this.x,
            topY: this.y - halfSize,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_UNIT_WIDTH,
            height: HEALTHBAR_UNIT_HEIGHT,
            basePlayerColor: this.color
        });

        return commands;
    }

    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (pointX >= this.x - halfSize && pointX <= this.x + halfSize &&
                pointY >= this.y - halfSize && pointY <= this.y + halfSize);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Unit Base Class ---
class Unit extends GameObject {
    constructor(x, y, playerId, unitStats = {}, size = 30, type = 'unit') {
        // Apply default stats with any overrides
        const stats = {
            maxHealth: 100,
            armor: 1,
            attackDamage: 0,
            attackSpeed: 1,
            attackRange: 0,
            hpRegen: 0.5,
            movementSpeed: 2,
            visionRange: 250,
            supplyCost: 1,
            ...unitStats
        };

        super(x, y, playerId, size, stats);

        // Store base stats for upgrades
        this.baseArmor = stats.armor;
        this.baseAttackDamage = stats.attackDamage;
        this.baseAttackRange = stats.attackRange;
        this.baseHpRegen = stats.hpRegen;
        this.baseMovementSpeed = stats.movementSpeed;

        // Unit-specific properties
        this.type = type;
        this.speed = stats.movementSpeed;
        this.targetX = x;
        this.targetY = y;
        this.targetUnit = null;
        this.commandState = 'idle';
        this.aMoveTargetX = x;
        this.aMoveTargetY = y;
        this.lastMoveAngle = 0;
        this.targetAcquisitionRange = this.attackRange * TARGET_ACQUISITION_RANGE_FACTOR;
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if the unit is visible on screen
        const halfSize = this.size / 2;
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y - halfSize > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // --- Draw Shadow ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(drawX + 3, drawY + 3, this.size, this.size);

        // --- Draw Unit Body ---
        ctx.fillStyle = this.color;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // --- Add Gradient Highlight ---
        const gradient = ctx.createLinearGradient(drawX, drawY, drawX + this.size, drawY + this.size);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(drawX, drawY, this.size, this.size);

        // --- Draw Unit Symbol (Direction Indicator) ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';

        // Use the stored lastMoveAngle property instead of calculating it dynamically
        const angle = this.lastMoveAngle;

        // Draw triangle pointing in movement direction
        const triangleSize = halfSize * 0.7;
        ctx.save();
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(triangleSize, 0);
        ctx.lineTo(-triangleSize/2, -triangleSize/2);
        ctx.lineTo(-triangleSize/2, triangleSize/2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // --- Draw Darker Border ---
        ctx.strokeStyle = getDarkerHslColor(this.color, 20);
        ctx.lineWidth = 2; // Increased unit border thickness
        ctx.strokeRect(drawX, drawY, this.size, this.size);

        // --- Draw Animated Selection --- (Modified)
        if (isSelected && this.playerId === currentPlayerId) {
             // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 5;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.fillRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT; // Use new thickness
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.strokeRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2
            );

             // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }
    }

    getUIDrawCommands(isSelected) {
        const commands = [];
        if (this.health <= 0) return commands;

        const halfSize = this.size / 2;

        // Health Bar command - Changed from text
        commands.push({
            type: 'healthBar',
            centerX: this.x,
            topY: this.y - halfSize - HEALTHBAR_UNIT_OFFSET_Y,
            currentHealth: this.health,
            maxHealth: this.maxHealth,
            width: HEALTHBAR_UNIT_WIDTH,
            height: HEALTHBAR_UNIT_HEIGHT,
            basePlayerColor: this.color // Pass player color
        });
        /* Original Text Health:
        commands.push({
            type: 'text',
            content: this.health,
            x: this.x,
            y: this.y - halfSize - 5,
            color: HEALTH_BAR_COLOR,
            font: HEALTH_BAR_FONT,
            textAlign: 'center'
        });
        */

        // Attack Range Indicator command
        if (isSelected && this.playerId === currentPlayerId && isAMoveMode) {
            commands.push({
                type: 'rangeSquare',
                x: this.x,
                y: this.y,
                radius: this.attackRange + halfSize, // Draw from edge
                // Use player color with reduced alpha for transparency
                color: players[this.playerId].color.replace(')', ', 0.4)').replace('hsl', 'hsla')
            });
        }

        return commands;
    }

    update(now, allGameObjects) {
        if (this.health <= 0) { this.commandState = 'idle'; return; }
        if (this.targetUnit && this.targetUnit.health <= 0) {
             this.targetUnit = null;
             if (this.commandState === 'attacking') { this.commandState = 'idle'; }
        }
         switch (this.commandState) {
             case 'idle': break;
             case 'moving':
                 this.targetUnit = null;
                 this.performMovement();
                 if (this.x === this.targetX && this.y === this.targetY) { this.commandState = 'idle'; }
                 break;
             case 'attacking':
                 if (!this.targetUnit) { this.commandState = 'idle'; break; }
                 this.handleCombat(now, this.targetUnit);
                 break;
             case 'attackMoving':
                 if (this.targetUnit) {
                     this.handleCombat(now, this.targetUnit);
                 } else {
                     const enemy = findNearestEnemyInRange(this, this.targetAcquisitionRange, allGameObjects);
                     if (enemy) {
                         this.targetUnit = enemy;
                         this.handleCombat(now, this.targetUnit);
                     } else {
                         this.targetX = this.aMoveTargetX;
                         this.targetY = this.aMoveTargetY;
                         this.performMovement();
                         if (this.x === this.aMoveTargetX && this.y === this.aMoveTargetY) { this.commandState = 'idle'; }
                     }
                 }
                 break;
         }
    }

    handleCombat(now, target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distanceToTarget = Math.hypot(dx, dy);
        const combinedHalfSizes = this.size / 2 + target.size / 2;
        const effectiveAttackRange = this.attackRange + combinedHalfSizes;

        if (distanceToTarget <= effectiveAttackRange) {
            this.targetX = this.x;
            this.targetY = this.y;
            const timeSinceLastAttack = now - this.lastAttackTime;
            if (timeSinceLastAttack >= this.attackCooldown) {
                target.takeDamage(this.attackDamage);
                this.lastAttackTime = now;

                // Add laser effect (with color and duration)
                attackEffects.push({
                    type: 'laser',
                    startX: this.x,
                    startY: this.y,
                    endX: target.x,
                    endY: target.y,
                    color: this.color, // Use unit's color
                    timestamp: now,
                    duration: ATTACK_EFFECT_DURATION
                });

                // Add spark burst effect at target (with duration)
                attackEffects.push({
                    type: 'burst',
                    x: target.x,
                    y: target.y,
                    color: SPARK_BURST_COLOR,
                    timestamp: now,
                    duration: SPARK_BURST_DURATION
                });
            }
        } else {
            this.targetX = target.x;
            this.targetY = target.y;
            this.performMovement();
        }
    }

    // Helper for standard movement towards targetX, targetY
    performMovement() {
        // If we're at the target, there's no need to move
        if (this.x === this.targetX && this.y === this.targetY) return;

        // Calculate direction to move
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distance = Math.hypot(dx, dy);

        // Normalize direction and multiply by speed
        let moveX = (dx / distance) * this.speed;
        let moveY = (dy / distance) * this.speed;

        // Check if we'd overshoot the target
        if (Math.abs(moveX) > Math.abs(dx)) moveX = dx;
        if (Math.abs(moveY) > Math.abs(dy)) moveY = dy;

        // Update position
        const finalX = this.x + moveX;
        const finalY = this.y + moveY;

        // Store last movement angle before updating position
        if (dx !== 0 || dy !== 0) {
            this.lastMoveAngle = Math.atan2(dy, dx);
        }

        this.x = finalX;
        this.y = finalY;
    }

    // Set movement target (basic move)
    moveTo(targetX, targetY) {
        this.targetX = targetX;
        this.targetY = targetY;
        this.commandState = 'moving';
        this.targetUnit = null;

        // Immediately update the direction angle for responsive visual feedback
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        if (dx !== 0 || dy !== 0) {
            this.lastMoveAngle = Math.atan2(dy, dx);
        }
    }

    // Set attack-move target
    attackMoveTo(targetX, targetY) {
        this.aMoveTargetX = targetX;
        this.aMoveTargetY = targetY;
        this.commandState = 'attackMoving';
        this.targetUnit = null;

        // Immediately update the direction angle for responsive visual feedback
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        if (dx !== 0 || dy !== 0) {
            this.lastMoveAngle = Math.atan2(dy, dx);
        }
    }

    attackUnit(target) {
        this.commandState = 'attacking';
        this.targetUnit = target;
    }

    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (pointX >= this.x - halfSize && pointX <= this.x + halfSize && pointY >= this.y - halfSize && pointY <= this.y + halfSize);
    }

    takeDamage(damageAmount) {
        this.health -= damageAmount;
        if (this.health < 0) this.health = 0;
    }
}

// --- Marine Class (Combat Unit) ---
class Marine extends Unit {
    constructor(x, y, playerId) {
        const marineStats = {
            maxHealth: 100,
            armor: 1,
            attackDamage: 10,
            attackSpeed: 1,
            attackRange: 100,
            hpRegen: 0.5,
            movementSpeed: 2,
            visionRange: 250,
            supplyCost: 1
        };

        super(x, y, playerId, marineStats, 30, 'marine');

        // Combat timing
        this.attackCooldown = 1000 / this.attackSpeed;
        this.lastAttackTime = 0;
    }

    // Ensure isUnderPoint is properly implemented
    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (pointX >= this.x - halfSize && pointX <= this.x + halfSize &&
                pointY >= this.y - halfSize && pointY <= this.y + halfSize);
    }

    // Set attack-move target
    attackMoveTo(targetX, targetY) {
        this.aMoveTargetX = targetX;
        this.aMoveTargetY = targetY;
        this.commandState = 'attackMoving';
        this.targetUnit = null;

        // Immediately update the direction angle for responsive visual feedback
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        if (dx !== 0 || dy !== 0) {
            this.lastMoveAngle = Math.atan2(dy, dx);
        }
    }

    // Attack a specific unit
    attackUnit(target) {
        this.commandState = 'attacking';
        this.targetUnit = target;
    }

    // Handle combat with a target
    handleCombat(now, target) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distanceToTarget = Math.hypot(dx, dy);
        const combinedHalfSizes = this.size / 2 + target.size / 2;
        const effectiveAttackRange = this.attackRange + combinedHalfSizes;

        if (distanceToTarget <= effectiveAttackRange) {
            this.targetX = this.x;
            this.targetY = this.y;
            const timeSinceLastAttack = now - this.lastAttackTime;
            if (timeSinceLastAttack >= this.attackCooldown) {
                target.takeDamage(this.attackDamage);
                this.lastAttackTime = now;

                // Add laser effect (with color and duration)
                attackEffects.push({
                    type: 'laser',
                    startX: this.x,
                    startY: this.y,
                    endX: target.x,
                    endY: target.y,
                    color: this.color, // Use unit's color
                    timestamp: now,
                    duration: ATTACK_EFFECT_DURATION
                });

                // Add spark burst effect at target (with duration)
                attackEffects.push({
                    type: 'burst',
                    x: target.x,
                    y: target.y,
                    color: SPARK_BURST_COLOR,
                    timestamp: now,
                    duration: SPARK_BURST_DURATION
                });
            }
        } else {
            this.targetX = target.x;
            this.targetY = target.y;
            this.performMovement();
        }
    }

    update(now, allGameObjects) {
        if (this.health <= 0) { this.commandState = 'idle'; return; }
        if (this.targetUnit && this.targetUnit.health <= 0) {
             this.targetUnit = null;
             if (this.commandState === 'attacking') { this.commandState = 'idle'; }
        }
         switch (this.commandState) {
             case 'idle': break;
             case 'moving':
                 this.targetUnit = null;
                 this.performMovement();
                 if (this.x === this.targetX && this.y === this.targetY) { this.commandState = 'idle'; }
                 break;
             case 'attacking':
                 if (!this.targetUnit) { this.commandState = 'idle'; break; }
                 this.handleCombat(now, this.targetUnit);
                 break;
             case 'attackMoving':
                 if (this.targetUnit) {
                     this.handleCombat(now, this.targetUnit);
                 } else {
                     const enemy = findNearestEnemyInRange(this, this.targetAcquisitionRange, allGameObjects);
                     if (enemy) {
                         this.targetUnit = enemy;
                         this.handleCombat(now, this.targetUnit);
                     } else {
                         this.targetX = this.aMoveTargetX;
                         this.targetY = this.aMoveTargetY;
                         this.performMovement();
                         if (this.x === this.aMoveTargetX && this.y === this.aMoveTargetY) { this.commandState = 'idle'; }
                     }
                 }
                 break;
         }
    }

    getUIDrawCommands(isSelected) {
        const commands = super.getUIDrawCommands(isSelected);

        // Add attack range indicator when selected and in A-Move mode
        if (isSelected && this.playerId === currentPlayerId && isAMoveMode) {
            const halfSize = this.size / 2;

            commands.push({
                type: 'rangeSquare',
                x: this.x,
                y: this.y,
                radius: this.attackRange + halfSize, // Draw from edge
                // Use player color with reduced alpha for transparency
                color: players[this.playerId].color.replace(')', ', 0.4)').replace('hsl', 'hsla')
            });
        }

        return commands;
    }
}

// --- Worker Class (Builder Unit) ---
class Worker extends Unit {
    constructor(x, y, playerId) {
        const workerStats = {
            maxHealth: 60,
            armor: 0,
            attackDamage: 0, // Workers can't attack
            attackSpeed: 0,
            attackRange: 0,
            hpRegen: 0.2,
            movementSpeed: 2.5, // Slightly faster than marines
            visionRange: 300,
            supplyCost: 1
        };

        // Make workers slightly larger than marines (35 vs 30)
        super(x, y, playerId, workerStats, 35, 'worker');

        // Worker-specific properties
        this.buildProgress = 0;
        this.buildTarget = null;
        this.buildType = null;
    }

    // Ensure isUnderPoint is properly implemented
    isUnderPoint(pointX, pointY) {
        const halfSize = this.size / 2;
        return (pointX >= this.x - halfSize && pointX <= this.x + halfSize &&
                pointY >= this.y - halfSize && pointY <= this.y + halfSize);
    }

    // Start building placement mode
    startBuildingPlacement(buildType) {
        // Check if player has enough resources
        const cost = BUILDING_COSTS[buildType];
        if (!cost) {
            console.log(`Unknown building type: ${buildType}`);
            return false;
        }

        const playerState = players[this.playerId];
        if (playerState.resources < cost) {
            console.log(`Not enough resources to build ${buildType}. Need ${cost}, have ${playerState.resources}`);
            return false;
        }

        // Enter building placement mode
        buildingPlacementMode = true;
        buildingTypeToPlace = buildType;
        buildingWorkers = [this]; // Start with this worker

        // Initial placement position is near the worker
        // Convert to grid coordinates first
        const workerGridPos = worldToGrid(this.x + 100, this.y);
        const gridX = workerGridPos.gridX;
        const gridY = workerGridPos.gridY;

        // Get building size
        const buildingSize = BUILDING_GRID_SIZES[buildType];
        const gridWidth = buildingSize.width;
        const gridHeight = buildingSize.height;

        // Calculate center position for multi-cell buildings
        if (gridWidth > 1 || gridHeight > 1) {
            const centerGridX = gridX + Math.floor(gridWidth / 2);
            const centerGridY = gridY + Math.floor(gridHeight / 2);
            const centerWorldPos = gridToWorld(centerGridX, centerGridY);

            buildingPlacementX = centerWorldPos.x;
            buildingPlacementY = centerWorldPos.y;
        } else {
            // For 1x1 buildings, use the center of the single cell
            const cellWorldPos = gridToWorld(gridX, gridY);
            buildingPlacementX = cellWorldPos.x;
            buildingPlacementY = cellWorldPos.y;
        }

        console.log(`Started placement mode for ${buildType}`);
        return true;
    }

    // Start building a structure
    build(buildType, targetX, targetY, gridX, gridY) {
        // Check if player has enough resources
        const cost = BUILDING_COSTS[buildType];
        if (!cost) {
            console.log(`Unknown building type: ${buildType}`);
            return false;
        }

        const playerState = players[this.playerId];
        if (playerState.resources < cost) {
            console.log(`Not enough resources to build ${buildType}. Need ${cost}, have ${playerState.resources}`);
            return false;
        }

        // Deduct resources
        playerState.resources -= cost;
        updateResourceSupplyDisplay();

        // Set the worker to building state
        this.commandState = 'building';
        this.buildType = buildType;
        this.buildTarget = { x: targetX, y: targetY };
        this.buildProgress = 0;
        this.targetX = targetX;
        this.targetY = targetY;

        // Get building size in grid cells
        const buildingSize = BUILDING_GRID_SIZES[buildType];
        const gridWidth = buildingSize.width;
        const gridHeight = buildingSize.height;

        // Use the provided grid coordinates directly
        console.log(`Building placement debug:`);
        console.log(`- Grid position: (${gridX}, ${gridY})`);
        console.log(`- Grid size: ${gridWidth}x${gridHeight}`);
        console.log(`- Target position: (${targetX}, ${targetY})`);

        // Use the target position directly from the building preview
        // This ensures the building is placed exactly where the preview shows
        console.log(`- Using target position directly: (${targetX}, ${targetY})`);

        // Store the grid coordinates for reference in the building object
        // This will be used for collision detection and placement validation

        // Create the building immediately in 'under construction' state
        let newBuilding = null;

        // Use the target position directly to ensure it matches the preview position
        if (buildType === 'bunker') {
            newBuilding = new Bunker(targetX, targetY, this.playerId, true);
        } else if (buildType === 'supplyDepot') {
            newBuilding = new SupplyDepot(targetX, targetY, this.playerId, true);
        } else if (buildType === 'shieldTower') {
            newBuilding = new ShieldTower(targetX, targetY, this.playerId, true);
        } else if (buildType === 'sensorTower') {
            newBuilding = new SensorTower(targetX, targetY, this.playerId, true);
        }

        if (newBuilding) {
            // Store reference to the building being constructed
            this.buildingUnderConstruction = newBuilding;
            // Store the grid position for future reference
            newBuilding.gridX = gridX;
            newBuilding.gridY = gridY;
            newBuilding.gridWidth = gridWidth;
            newBuilding.gridHeight = gridHeight;
            // Add the building to the game objects
            gameObjects.push(newBuilding);
            console.log(`Created ${buildType} in 'under construction' state at grid (${gridX}, ${gridY})`);
        }

        console.log(`Worker started building ${buildType} at (${centerX}, ${centerY})`);
        return true;
    }

    update(now, allGameObjects) {
        if (this.health <= 0) {
            this.commandState = 'idle';
            return;
        }

        switch (this.commandState) {
            case 'idle':
                break;
            case 'moving':
                this.performMovement();
                if (this.x === this.targetX && this.y === this.targetY) {
                    this.commandState = 'idle';
                }
                break;
            case 'building':
                // First move to the build location
                if (this.x !== this.targetX || this.y !== this.targetY) {
                    this.performMovement();
                    return;
                }

                // Once at the location, progress the building
                // Calculate build speed based on BUILD_TIME (5 seconds)
                const buildSpeed = 1 / (BUILD_TIME / 16.67); // 16.67ms is approx. one frame at 60fps

                // Progress the building
                this.buildProgress += buildSpeed;

                // Update the building's construction progress
                if (this.buildingUnderConstruction) {
                    this.buildingUnderConstruction.constructionProgress = this.buildProgress;
                }

                // Check for other workers building the same structure
                // This is a simple implementation - in a real game you'd want to track this more efficiently
                let buildingWorkerCount = 1; // Start with this worker
                for (const obj of allGameObjects) {
                    if (obj !== this &&
                        obj.type === 'worker' &&
                        obj.playerId === this.playerId &&
                        obj.commandState === 'building' &&
                        obj.buildType === this.buildType &&
                        Math.hypot(obj.targetX - this.targetX, obj.targetY - this.targetY) < 10) {
                        buildingWorkerCount++;
                    }
                }

                // Each additional worker adds 50% more build speed
                if (buildingWorkerCount > 1) {
                    const bonusSpeed = buildSpeed * 0.5 * (buildingWorkerCount - 1);
                    this.buildProgress += bonusSpeed;

                    // Update the building's construction progress again after bonus
                    if (this.buildingUnderConstruction) {
                        this.buildingUnderConstruction.constructionProgress = this.buildProgress;
                    }
                }

                // When building is complete
                if (this.buildProgress >= 1) {
                    // Only the first worker should finish the building
                    // to avoid multiple workers trying to complete the same building
                    let isFirstWorkerOnBuilding = true;
                    for (const obj of allGameObjects) {
                        if (obj !== this &&
                            obj.type === 'worker' &&
                            obj.playerId === this.playerId &&
                            obj.commandState === 'building' &&
                            obj.buildType === this.buildType &&
                            Math.hypot(obj.targetX - this.targetX, obj.targetY - this.targetY) < 10 &&
                            obj.buildProgress >= this.buildProgress) {
                            // Found a worker with higher or equal progress, so we're not the first
                            isFirstWorkerOnBuilding = false;
                            break;
                        }
                    }

                    if (isFirstWorkerOnBuilding) {
                        console.log('This worker is finishing the building');
                        this.finishBuilding(allGameObjects);

                        // Reset all other workers on this building
                        for (const obj of allGameObjects) {
                            if (obj !== this &&
                                obj.type === 'worker' &&
                                obj.playerId === this.playerId &&
                                obj.commandState === 'building' &&
                                obj.buildType === this.buildType &&
                                Math.hypot(obj.targetX - this.targetX, obj.targetY - this.targetY) < 10) {
                                // Reset this worker's building state
                                obj.buildType = null;
                                obj.buildProgress = 0;
                                obj.commandState = 'idle';
                                obj.buildingUnderConstruction = null;
                            }
                        }
                    } else {
                        // Not the first worker, just wait for the first one to finish
                        console.log('This worker is waiting for the first worker to finish');
                    }
                }
                break;
        }
    }

    finishBuilding(allGameObjects) {
        console.log('Starting finishBuilding method');
        try {
            // If we have a reference to the building under construction, complete it
            if (this.buildingUnderConstruction) {
                console.log('Building reference exists:', this.buildingUnderConstruction.type);

                // Mark the building as completed
                this.buildingUnderConstruction.isUnderConstruction = false;

                // For supply depots, add the supply bonus now that construction is complete
                if (this.buildType === 'supplyDepot') {
                    const playerState = players[this.playerId];
                    if (playerState) {
                        playerState.supplyCap += this.buildingUnderConstruction.supplyBonus;
                        console.log(`Player ${this.playerId} supply cap increased to ${playerState.supplyCap}`);
                        updateResourceSupplyDisplay();
                    }
                }

                // For bunkers, set the initial rally point to the center of the map and add supply bonus
                if (this.buildType === 'bunker') {
                    console.log(`Bunker construction completed, setting initial rally point`);
                    this.buildingUnderConstruction.rallyPoint = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

                    // Add supply bonus for bunkers
                    const playerState = players[this.playerId];
                    if (playerState) {
                        playerState.supplyCap += this.buildingUnderConstruction.supplyBonus;
                        console.log(`Player ${this.playerId} supply cap increased to ${playerState.supplyCap}`);
                        updateResourceSupplyDisplay();
                    }
                }

                console.log(`Worker completed building ${this.buildType} at (${this.targetX}, ${this.targetY})`);

                // Push the worker away from the building to prevent overlap
                try {
                    this.pushAwayFromBuilding(this.buildingUnderConstruction);
                } catch (pushError) {
                    console.error('Error pushing worker away:', pushError);
                }

                // Clear the reference
                this.buildingUnderConstruction = null;
            } else {
            // Check if there's already a building at this location
            let existingBuilding = null;
            for (const obj of allGameObjects) {
                if (obj.type === this.buildType &&
                    Math.hypot(obj.x - this.targetX, obj.y - this.targetY) < 10 &&
                    obj.playerId === this.playerId) {
                    existingBuilding = obj;
                    break;
                }
            }

            if (existingBuilding) {
                console.log(`Found existing ${this.buildType} at target location, marking as complete`);
                existingBuilding.isUnderConstruction = false;

                // For supply depots, add the supply bonus
                if (this.buildType === 'supplyDepot') {
                    const playerState = players[this.playerId];
                    if (playerState) {
                        playerState.supplyCap += existingBuilding.supplyBonus;
                        console.log(`Player ${this.playerId} supply cap increased to ${playerState.supplyCap}`);
                        updateResourceSupplyDisplay();
                    }
                }

                // For bunkers, set the initial rally point to the center of the map and add supply bonus
                if (this.buildType === 'bunker') {
                    console.log(`Bunker construction completed, setting initial rally point`);
                    existingBuilding.rallyPoint = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

                    // Add supply bonus for bunkers
                    const playerState = players[this.playerId];
                    if (playerState) {
                        playerState.supplyCap += existingBuilding.supplyBonus;
                        console.log(`Player ${this.playerId} supply cap increased to ${playerState.supplyCap}`);
                        updateResourceSupplyDisplay();
                    }
                }

                // Push away from the existing building
                this.pushAwayFromBuilding(existingBuilding);
            } else {
                // Fallback to the old method if we don't have a reference and no existing building
                console.log(`Creating new ${this.buildType} at (${this.targetX}, ${this.targetY})`);
                let newBuilding = null;

                if (this.buildType === 'bunker') {
                    newBuilding = new Bunker(this.targetX, this.targetY, this.playerId);
                } else if (this.buildType === 'supplyDepot') {
                    newBuilding = new SupplyDepot(this.targetX, this.targetY, this.playerId);
                } else if (this.buildType === 'shieldTower') {
                    newBuilding = new ShieldTower(this.targetX, this.targetY, this.playerId);
                } else if (this.buildType === 'sensorTower') {
                    newBuilding = new SensorTower(this.targetX, this.targetY, this.playerId);
                }

                if (newBuilding) {
                    // For bunkers, set the initial rally point to the center of the map and add supply bonus
                    if (this.buildType === 'bunker') {
                        console.log(`Bunker construction completed, setting initial rally point`);
                        newBuilding.rallyPoint = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };

                        // Add supply bonus for bunkers
                        const playerState = players[this.playerId];
                        if (playerState) {
                            playerState.supplyCap += newBuilding.supplyBonus;
                            console.log(`Player ${this.playerId} supply cap increased to ${playerState.supplyCap}`);
                            updateResourceSupplyDisplay();
                        }
                    }

                    allGameObjects.push(newBuilding);
                    console.log(`Worker completed building ${this.buildType} at (${this.targetX}, ${this.targetY})`);
                    this.pushAwayFromBuilding(newBuilding);
                }
            }
        }

        // Reset building state
        this.buildType = null;
        this.buildProgress = 0;
        this.commandState = 'idle';
        } catch (error) {
            console.error('Error in finishBuilding:', error);
        }
    }

    // Push the worker away from a building to prevent overlap
    pushAwayFromBuilding(building) {
        if (!building) {
            console.error('pushAwayFromBuilding called with null building');
            return;
        }

        console.log('Pushing worker away from building:', building.type);

        // Calculate vector from building to worker
        const dx = this.x - building.x;
        const dy = this.y - building.y;

        // Calculate distance
        const distance = Math.hypot(dx, dy);
        if (distance === 0) {
            // If distance is zero, push in a random direction
            this.x += 20; // Push right by default
            console.log('Zero distance detected, pushing worker to the right');
            return;
        }

        // Calculate minimum separation distance (sum of radii plus a small buffer)
        const minDistance = (this.size + building.size) / 2 + 10;

        // If we're too close, push away
        if (distance < minDistance) {
            // Normalize the direction vector
            const normalizedDx = dx / distance;
            const normalizedDy = dy / distance;

            // Calculate new position
            const pushDistance = minDistance - distance;
            this.x += normalizedDx * pushDistance;
            this.y += normalizedDy * pushDistance;

            console.log(`Worker pushed away from completed building`);
        }
    }

    drawBody(ctx, isSelected) {
        if (this.health <= 0) return;

        // Convert world position to screen position
        const screenPos = worldToScreen(this.x, this.y);

        // Check if the unit is visible on screen
        const halfSize = this.size / 2;
        if (screenPos.x + halfSize < 0 ||
            screenPos.x - halfSize > canvas.width ||
            screenPos.y + halfSize < 0 ||
            screenPos.y > canvas.height) {
            return; // Skip rendering if offscreen
        }

        const now = performance.now(); // Needed for selection animation

        const drawX = screenPos.x - halfSize;
        const drawY = screenPos.y - halfSize;

        // --- Draw Shadow ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        // Draw rounded shadow
        ctx.beginPath();
        const cornerRadius = 8; // Rounded corner radius
        ctx.roundRect(drawX + 3, drawY + 3, this.size, this.size, cornerRadius);
        ctx.fill();

        // --- Draw Worker Body with Rounded Corners ---
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.roundRect(drawX, drawY, this.size, this.size, cornerRadius);
        ctx.fill();

        // --- Add Gradient Highlight ---
        const gradient = ctx.createLinearGradient(drawX, drawY, drawX + this.size, drawY + this.size);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(drawX, drawY, this.size, this.size, cornerRadius);
        ctx.fill();

        // --- Draw Unit Symbol (Circle Direction Indicator instead of Triangle) ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';

        // Draw circle pointing in movement direction
        const circleRadius = halfSize * 0.3;
        const angle = this.lastMoveAngle;
        const circleX = screenPos.x + Math.cos(angle) * (halfSize * 0.4);
        const circleY = screenPos.y + Math.sin(angle) * (halfSize * 0.4);

        ctx.beginPath();
        ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
        ctx.fill();

        // --- Draw Dashed Border ---
        ctx.strokeStyle = getDarkerHslColor(this.color, 20);
        ctx.lineWidth = 2; // Increased unit border thickness
        ctx.setLineDash([5, 3]); // Dashed border pattern
        ctx.beginPath();
        ctx.roundRect(drawX, drawY, this.size, this.size, cornerRadius);
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash pattern

        // --- Draw Animated Selection --- (Modified)
        if (isSelected && this.playerId === currentPlayerId) {
            // Save context state
            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;
            const originalWidth = ctx.lineWidth;
            const originalStroke = ctx.strokeStyle;

            const padding = 5;

            // Draw selection glow
            ctx.fillStyle = SELECTION_GLOW_COLOR;
            ctx.beginPath();
            ctx.roundRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2,
                cornerRadius + padding
            );
            ctx.fill();

            // Calculate animation offset
            const dashOffset = -(now * SELECTION_ANIMATION_SPEED) % (SELECTION_DASH_PATTERN[0] + SELECTION_DASH_PATTERN[1]);

            ctx.strokeStyle = this.color; // Use player color
            ctx.lineWidth = SELECTION_LINE_WIDTH_UNIT; // Use new thickness
            ctx.setLineDash(SELECTION_DASH_PATTERN);
            ctx.lineDashOffset = dashOffset;

            ctx.beginPath();
            ctx.roundRect(
                drawX - padding,
                drawY - padding,
                this.size + padding * 2,
                this.size + padding * 2,
                cornerRadius + padding
            );
            ctx.stroke();

            // Restore context state
            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            ctx.lineWidth = originalWidth;
            ctx.strokeStyle = originalStroke;
        }

        // If building, draw a progress indicator
        if (this.commandState === 'building' && this.buildProgress > 0) {
            // Draw progress bar above the worker
            const barWidth = this.size;
            const barHeight = 4;
            const barX = screenPos.x - barWidth / 2;
            const barY = screenPos.y - halfSize - 10;

            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // Progress
            ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
            ctx.fillRect(barX, barY, barWidth * this.buildProgress, barHeight);

            // Border
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
        }
    }
}

// --- Initialization ---
function setupGame() {
    gameObjects.length = 0;
    selectedUnits = [];
    Object.keys(players).forEach(id => { players[id].currentSupply = 0; });

    // Calculate tile positions
    const tileWidth = MAP_WIDTH / TILE_COUNT;
    const tileHeight = MAP_HEIGHT / TILE_COUNT;

    // Team 1 (Red) - Top-left quadrant
    // Player 1 - right of corner
    gameObjects.push(new Bunker(tileWidth * 1 + tileWidth/2, tileHeight * 0 + tileHeight/2, 1));
    // Add a worker for player 1
    gameObjects.push(new Worker(tileWidth * 1 + tileWidth/2 + 150, tileHeight * 0 + tileHeight/2, 1));

    // Player 2 - below corner
    gameObjects.push(new Bunker(tileWidth * 0 + tileWidth/2, tileHeight * 1 + tileHeight/2, 2));
    // Add a worker for player 2
    gameObjects.push(new Worker(tileWidth * 0 + tileWidth/2 + 150, tileHeight * 1 + tileHeight/2, 2));

    // Team 2 (Blue) - Top-right quadrant
    // Player 3 - left of corner
    gameObjects.push(new Bunker(tileWidth * 6 + tileWidth/2, tileHeight * 0 + tileHeight/2, 3));
    // Add a worker for player 3
    gameObjects.push(new Worker(tileWidth * 6 + tileWidth/2 - 150, tileHeight * 0 + tileHeight/2, 3));

    // Player 4 - below corner
    gameObjects.push(new Bunker(tileWidth * 7 + tileWidth/2, tileHeight * 1 + tileHeight/2, 4));
    // Add a worker for player 4
    gameObjects.push(new Worker(tileWidth * 7 + tileWidth/2 - 150, tileHeight * 1 + tileHeight/2, 4));

    // Team 3 (Green) - Bottom-left quadrant
    // Player 5 - right of corner
    gameObjects.push(new Bunker(tileWidth * 1 + tileWidth/2, tileHeight * 7 + tileHeight/2, 5));
    // Add a worker for player 5
    gameObjects.push(new Worker(tileWidth * 1 + tileWidth/2 + 150, tileHeight * 7 + tileHeight/2, 5));

    // Player 6 - above corner
    gameObjects.push(new Bunker(tileWidth * 0 + tileWidth/2, tileHeight * 6 + tileHeight/2, 6));
    // Add a worker for player 6
    gameObjects.push(new Worker(tileWidth * 0 + tileWidth/2 + 150, tileHeight * 6 + tileHeight/2, 6));

    // Team 4 (Brown) - Bottom-right quadrant
    // Player 7 - left of corner
    gameObjects.push(new Bunker(tileWidth * 6 + tileWidth/2, tileHeight * 7 + tileHeight/2, 7));
    // Add a worker for player 7
    gameObjects.push(new Worker(tileWidth * 6 + tileWidth/2 - 150, tileHeight * 7 + tileHeight/2, 7));

    // Player 8 - above corner
    gameObjects.push(new Bunker(tileWidth * 7 + tileWidth/2, tileHeight * 6 + tileHeight/2, 8));
    // Add a worker for player 8
    gameObjects.push(new Worker(tileWidth * 7 + tileWidth/2 - 150, tileHeight * 6 + tileHeight/2, 8));

    // Update supply counts
    updateSupplyCounts();

    // Initialize resource and supply display
    lastResourceUpdateTime = performance.now();
    updateResourceSupplyDisplay();

    // Initialize upgrade levels display
    updateUpgradeLevels();

    switchPlayer(1);
}

// Helper function to update supply counts
function updateSupplyCounts() {
    // Reset all supply counts
    Object.keys(players).forEach(id => { players[id].currentSupply = 0; });

    // Count units for each player
    gameObjects.forEach(obj => {
        if (obj.health > 0 && obj.supplyCost > 0) {
            players[obj.playerId].currentSupply += obj.supplyCost;
        }
    });
}

// --- Player Control ---
const playerBtns = {
    1: document.getElementById('player1Btn'),
    2: document.getElementById('player2Btn'),
    3: document.getElementById('player3Btn'),
    4: document.getElementById('player4Btn'),
    5: document.getElementById('player5Btn'),
    6: document.getElementById('player6Btn'),
    7: document.getElementById('player7Btn'),
    8: document.getElementById('player8Btn')
};

function switchPlayer(newPlayerId) {
    if (newPlayerId < 1 || newPlayerId > 8) return;
    currentPlayerId = newPlayerId;
    isAMoveMode = false;
    selectedUnits = []; // Clear selection
    Object.values(playerBtns).forEach(btn => btn.classList.remove('active'));
    if (playerBtns[currentPlayerId]) playerBtns[currentPlayerId].classList.add('active');
    console.log(`Switched to Player ${currentPlayerId} (Team ${players[currentPlayerId].team})`);

    // Update resource and supply display for the new player
    updateResourceSupplyDisplay();
}

// Update event listeners for all player buttons
for (let i = 1; i <= 8; i++) {
    if (playerBtns[i]) {
        playerBtns[i].addEventListener('click', () => switchPlayer(i));
    }
}

// --- Input Handling ---
window.addEventListener('keydown', handleKeyDown);
canvas.addEventListener('contextmenu', handleRightClick);

function handleKeyDown(event) {
    // Check if the key is for the UI system
    const key = event.key.toLowerCase();
    const uiKeys = ['q', 'w', 'e', 'r', 't', 'a', 's', 'd', 'f', 'g', 'z', 'x', 'c', 'v', 'b', '5', '6'];

    // If it's a UI hotkey, let the UI system handle it
    if (uiSystem && uiKeys.includes(key)) {
        // The UI system will handle these keys
        return;
    }

    // Handle game-specific keys
    const upperKey = key.toUpperCase();

    // Handle Escape key first (cancel building placement or A-move)
    if (upperKey === 'ESCAPE') {
        if (buildingPlacementMode) {
            // Cancel building placement
            buildingPlacementMode = false;
            buildingTypeToPlace = null;
            buildingWorkers = [];
            console.log('Building placement canceled');
            return;
        }

        if (isAMoveMode) {
            isAMoveMode = false;
            console.log('A-Move mode canceled');
            return;
        }
    }

    // Hotkey 1: Select all player-owned marines
    if (key === '1') {
        selectAllUnitsOfType('marine', currentPlayerId);
    }
    // Hotkey 2: Select all player-owned bunkers
    else if (key === '2') {
        selectAllUnitsOfType('bunker', currentPlayerId);
    }
    // Hotkey 3: Select all player-owned workers and show build menu
    else if (key === '3') {
        selectAllUnitsOfType('worker', currentPlayerId);
        // Switch to page 3 (build menu) in the UI system
        if (uiSystem) {
            uiSystem.switchToPage(3);
        }
    }
    else if (upperKey === 'A') {
        if (selectedUnits.some(unit => unit.type === 'marine' && unit.playerId === currentPlayerId)) {
             isAMoveMode = true; console.log("A-Move mode activated");
        }
    } else if (upperKey >= '7' && upperKey <= '8') {
         switchPlayer(parseInt(upperKey));
    }

    // Toggle performance monitor with comma key
    if (key === ',') {
        togglePerformanceMonitor();
    }

    // Toggle player controls with period key
    if (key === '.') {
        togglePlayerControls();
    }
}

// Function to select all units of a specific type owned by a player
function selectAllUnitsOfType(unitType, playerId) {
    // Clear current selection
    selectedUnits = [];

    // Find all units of the specified type owned by the player
    gameObjects.forEach(obj => {
        if (obj.type === unitType && obj.playerId === playerId && obj.health > 0) {
            selectedUnits.push(obj);
        }
    });

    console.log(`Selected ${selectedUnits.length} ${unitType}(s) for player ${playerId}`);
}

// Track current mouse position for edge scrolling
let mousePos = { x: 0, y: 0 };

function updateEdgeScrolling() {
    const margin = EDGE_SCROLL_MARGIN;
    const speed = CAMERA_SPEED;

    // Reset velocities to zero by default (strict stop when not at edge)
    camera.velX = 0;
    camera.velY = 0;

    // Left edge
    if (mousePos.x < margin) {
        camera.velX = -speed;
    }
    // Right edge
    else if (mousePos.x > canvas.width - margin) {
        camera.velX = speed;
    }

    // Top edge
    if (mousePos.y < margin) {
        camera.velY = -speed;
    }
    // Bottom edge
    else if (mousePos.y > canvas.height - margin) {
        camera.velY = speed;
    }

    // Update camera position
    camera.update();
}

function getMousePos(event) {
    const rect = canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Update the stored mouse position for edge scrolling
    mousePos = { x: screenX, y: screenY };

    // Convert to world coordinates
    return screenToWorld(screenX, screenY);
}

canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);

function handleMouseDown(event) {
    // Don't start dragging if we're in building placement mode
    if (buildingPlacementMode) {
        return; // Skip selection box when placing buildings
    }

    if (event.button === 0 && !isAMoveMode) {
        isDragging = true;
        const mousePos = getMousePos(event);
        dragStartX = mousePos.x;
        dragStartY = mousePos.y;
        dragEndX = dragStartX;
        dragEndY = dragStartY;
        // Deselect on mousedown BEFORE checking click/drag type in mouseup
        selectedUnits = [];
    }
}

function handleMouseMove(event) {
    // Always update mouse position for edge scrolling
    const mousePos = getMousePos(event);

    // Update drag end position only if we're currently dragging
    if (isDragging) {
        dragEndX = mousePos.x;
        dragEndY = mousePos.y;
    }

    // Update building placement position (now handled in drawSelectionRect)
    // Grid snapping and validation is done in the drawing function
}

function handleMouseUp(event) {
    const mousePos = getMousePos(event);

    // Building Placement
    if (event.button === 0 && buildingPlacementMode && buildingTypeToPlace) {
        // Check if placement is valid
        if (isValidPlacement && buildingWorkers.length > 0) {
            // Get the first worker to start building
            const firstWorker = buildingWorkers[0];

            // Start building at the grid-aligned placement position
            // Pass both the world position and grid coordinates
            if (firstWorker.build(buildingTypeToPlace, buildingPlacementX, buildingPlacementY, buildingPlacementGridX, buildingPlacementGridY)) {
                // Store the building reference from the first worker
                const buildingRef = firstWorker.buildingUnderConstruction;

                // If successful, assign additional workers to help build
                for (let i = 1; i < buildingWorkers.length; i++) {
                    // Build but also share the same building reference
                    buildingWorkers[i].build(buildingTypeToPlace, buildingPlacementX, buildingPlacementY, buildingPlacementGridX, buildingPlacementGridY);
                    buildingWorkers[i].buildingUnderConstruction = buildingRef;
                }

                // Exit building placement mode
                buildingPlacementMode = false;
                buildingTypeToPlace = null;
                buildingWorkers = [];
            }
        } else {
            // Invalid placement - provide feedback (could add a sound or visual effect here)
            console.log('Invalid building placement');
        }
        return;
    }

    // A-Move Command
    if (event.button === 0 && isAMoveMode) {
        const commandableUnits = selectedUnits.filter(obj => (obj.type === 'unit' || obj.type === 'marine') && obj.playerId === currentPlayerId);
        if (commandableUnits.length > 0) {
            console.log(`A-Move command to ${mousePos.x}, ${mousePos.y}`);
            commandableUnits.forEach(unit => unit.attackMoveTo(mousePos.x, mousePos.y));
            // Add an A-Move marker
            movementMarkers.push({
                x: mousePos.x,
                y: mousePos.y,
                timestamp: performance.now(),
                playerId: currentPlayerId, // Still useful for context, though color is fixed
                isAttackMove: true // Flag this marker type
            });
        }
        isAMoveMode = false;
        isDragging = false;
        return;
    }
    if (event.button === 0 && isDragging) {
        isDragging = false;
        const dragDistance = Math.hypot(dragEndX - dragStartX, dragEndY - dragStartY);
        let objectsInSelection = [];
        if (dragDistance < CLICK_DRAG_THRESHOLD) { // Click Selection
            let clickedObject = null;
            for (let i = gameObjects.length - 1; i >= 0; i--) {
                const obj = gameObjects[i];
                if (obj.health > 0 && obj.isUnderPoint(mousePos.x, mousePos.y)) {
                    // Prioritize selecting own units/bunkers for the current player
                    if (obj.playerId === currentPlayerId) { clickedObject = obj; break; }
                }
            }
            if (clickedObject) objectsInSelection.push(clickedObject);
        } else { // Drag Selection
            const rect = { x: Math.min(dragStartX, dragEndX), y: Math.min(dragStartY, dragEndY),
                         width: Math.abs(dragEndX - dragStartX), height: Math.abs(dragEndY - dragStartY) };
            gameObjects.forEach(obj => {
                if (obj.health > 0 && obj.playerId === currentPlayerId && isUnitInRect(obj, rect)) {
                    objectsInSelection.push(obj);
                }
            });
        }
        selectedUnits = objectsInSelection.filter(obj => obj.type === 'unit' || obj.type === 'marine' || obj.type === 'worker' || obj.type === 'bunker');
    }
    if (isAMoveMode && event.button !== 0) isAMoveMode = false;
}

function handleRightClick(event) {
    event.preventDefault();
    isAMoveMode = false;

    // Cancel building placement on right-click
    if (buildingPlacementMode) {
        buildingPlacementMode = false;
        buildingTypeToPlace = null;
        buildingWorkers = [];
        console.log('Building placement canceled by right-click');
        return;
    }

    const commandableUnits = selectedUnits.filter(obj => (obj.type === 'unit' || obj.type === 'marine' || obj.type === 'worker') && obj.playerId === currentPlayerId);
    const selectedPlayerBunkers = selectedUnits.filter(obj => obj.type === 'bunker' && obj.playerId === currentPlayerId);

    if (commandableUnits.length === 0 && selectedPlayerBunkers.length === 0) return;

    const clickPos = getMousePos(event);
    let clickedTarget = null; // Enemy target

    // Find clickable objects at the cursor position
    let clickedBuildingUnderConstruction = null;

    for (let i = gameObjects.length - 1; i >= 0; i--) {
        const obj = gameObjects[i];

        // Check if this is a building under construction owned by the player
        if (obj.health > 0 && obj.isUnderPoint(clickPos.x, clickPos.y)) {
            if (obj.isUnderConstruction && obj.playerId === currentPlayerId) {
                clickedBuildingUnderConstruction = obj;
                break;
            }
            // Only consider living objects that aren't allies for attack targeting
            else if (!areAllies(currentPlayerId, obj.playerId)) {
                clickedTarget = obj;
                break;
            }
        }
    }

    let issuedMoveCommand = false;
    // Command units
    if (commandableUnits.length > 0) {
        // Check if we clicked on a building under construction
        if (clickedBuildingUnderConstruction) {
            // Filter for workers only
            const workers = commandableUnits.filter(unit => unit.type === 'worker');

            if (workers.length > 0) {
                console.log(`Assigning ${workers.length} worker(s) to resume construction`);

                // Determine building type from the clicked building
                let buildingType = clickedBuildingUnderConstruction.type;

                workers.forEach(worker => {
                    // Move to the building location
                    worker.moveTo(clickedBuildingUnderConstruction.x, clickedBuildingUnderConstruction.y);

                    // Set up the worker to continue construction
                    worker.commandState = 'building';
                    worker.buildType = buildingType;
                    worker.buildTarget = { x: clickedBuildingUnderConstruction.x, y: clickedBuildingUnderConstruction.y };
                    worker.targetX = clickedBuildingUnderConstruction.x;
                    worker.targetY = clickedBuildingUnderConstruction.y;
                    worker.buildProgress = clickedBuildingUnderConstruction.constructionProgress;
                    worker.buildingUnderConstruction = clickedBuildingUnderConstruction;

                    console.log(`Worker assigned to continue building ${buildingType} at progress ${worker.buildProgress}`);
                });
            } else {
                // Non-workers just move to the building
                commandableUnits.forEach(unit => {
                    unit.moveTo(clickPos.x, clickPos.y);
                    issuedMoveCommand = true;
                });
            }
        } else {
            // Normal command handling
            commandableUnits.forEach(unit => {
                if (clickedTarget) {
                    unit.attackUnit(clickedTarget);
                } else {
                    unit.moveTo(clickPos.x, clickPos.y);
                    issuedMoveCommand = true;
                }
            });
        }
    }

    // Command bunkers (set rally point)
    if (selectedPlayerBunkers.length > 0) {
        if (!clickedTarget) { // Only set rally on ground click
             console.log("Setting Rally Point");
             selectedPlayerBunkers.forEach(bunker => {
                 bunker.rallyPoint = { x: clickPos.x, y: clickPos.y };
             });
             issuedMoveCommand = false; // No move marker for rally set
        }
    }

    if (issuedMoveCommand) {
        // Add a regular move marker (no isAttackMove flag)
        movementMarkers.push({
            x: clickPos.x,
            y: clickPos.y,
            timestamp: performance.now(),
            playerId: currentPlayerId
        });
    }
}

// --- Helper Functions ---
function areAllies(playerIdA, playerIdB) {
    if (playerIdA === playerIdB) return true; // Same player
    return players[playerIdA]?.team === players[playerIdB]?.team; // Same team
}

function findNearestEnemyInRange(unit, range, allGameObjects) {
    // Check if this unit is valid
    if (!unit || unit.health <= 0) return null;

    let nearestEnemy = null;
    let nearestDistance = Infinity;

    allGameObjects.forEach(obj => {
        // Skip self, allies or dead objects
        if (obj === unit || obj.health <= 0 || areAllies(unit.playerId, obj.playerId)) return;

        const distance = Math.hypot(obj.x - unit.x, obj.y - unit.y);
        // Check if within range and closer than current nearest
        if (distance <= range && distance < nearestDistance) {
            nearestEnemy = obj;
            nearestDistance = distance;
        }
    });

    return nearestEnemy;
}

function isUnitInRect(unit, rect) {
    const halfSize = unit.size / 2;
    const unitLeft = unit.x - halfSize;
    const unitRight = unit.x + halfSize;
    const unitTop = unit.y - halfSize;
    const unitBottom = unit.y + halfSize;
    const rectLeft = rect.x;
    const rectRight = rect.x + rect.width;
    const rectTop = rect.y;
    const rectBottom = rect.y + rect.height;
    return (unitLeft < rectRight && unitRight > rectLeft && unitTop < rectBottom && unitBottom > rectTop);
}

function checkUnitCollision(objA, objB) {
    // Skip collision check if either object is dead
    if (objA === objB || objA.health <= 0 || objB.health <= 0) return false;

    // Allow workers to overlap with buildings under construction
    if ((objA.type === 'worker' && objB.isUnderConstruction) ||
        (objB.type === 'worker' && objA.isUnderConstruction)) {
        return false;
    }

    const halfSizeA = objA.size / 2;
    const leftA = objA.x - halfSizeA;
    const rightA = objA.x + halfSizeA;
    const topA = objA.y - halfSizeA;
    const bottomA = objA.y + halfSizeA;
    const halfSizeB = objB.size / 2;
    const leftB = objB.x - halfSizeB;
    const rightB = objB.x + halfSizeB;
    const topB = objB.y - halfSizeB;
    const bottomB = objB.y + halfSizeB;
    return (leftA < rightB && rightA > leftB && topA < bottomB && bottomA > topB);
}

// --- Collision Resolution ---
function resolveUnitCollisions(allGameObjects) {
    const PUSH_FACTOR = 0.5;
    const BUNKER_PUSH_FACTOR = 0.1;
    for (let i = 0; i < allGameObjects.length; i++) {
        for (let j = i + 1; j < allGameObjects.length; j++) {
            const objA = allGameObjects[i];
            const objB = allGameObjects[j];
            if (objA.health <= 0 || objB.health <= 0 || (objA.type === 'bunker' && objB.type === 'bunker')) continue;
            if (checkUnitCollision(objA, objB)) {
                 const dx = objB.x - objA.x;
                 const dy = objB.y - objA.y;
                 let distance = Math.hypot(dx, dy);
                 if (distance === 0) {
                     distance = 0.1;
                     if (objA.type === 'unit' || objA.type === 'marine' || objA.type === 'worker') { objA.x += (Math.random() - 0.5) * 0.2; objA.y += (Math.random() - 0.5) * 0.2; }
                     if (objB.type === 'unit' || objB.type === 'marine' || objB.type === 'worker') { objB.x += (Math.random() - 0.5) * 0.2; objB.y += (Math.random() - 0.5) * 0.2; }
                 }
                 const overlap = (objA.size / 2 + objB.size / 2) - distance;
                 if (overlap > 0) {
                     const separationX = dx / distance;
                     const separationY = dy / distance;
                     let pushA = PUSH_FACTOR;
                     let pushB = PUSH_FACTOR;
                     if (objA.type === 'bunker') pushA = BUNKER_PUSH_FACTOR;
                     if (objB.type === 'bunker') pushB = BUNKER_PUSH_FACTOR;
                     const totalPush = overlap;
                     const massRatioA = pushB / (pushA + pushB);
                     const massRatioB = pushA / (pushA + pushB);
                     if (objA.type === 'unit' || objA.type === 'marine' || objA.type === 'worker') { objA.x -= separationX * totalPush * massRatioA; objA.y -= separationY * totalPush * massRatioA; }
                     if (objB.type === 'unit' || objB.type === 'marine' || objB.type === 'worker') { objB.x += separationX * totalPush * massRatioB; objB.y += separationY * totalPush * massRatioB; }
                 }
            }
        }
    }
}

// --- Drawing Functions ---
function drawBackground(ctx) {
    // First, fill the entire visible area with the visual boundary color
    ctx.fillStyle = VISUAL_BOUNDARY_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate visible tile range based on camera position
    const startTileX = Math.floor(camera.x / TILE_WIDTH);
    const startTileY = Math.floor(camera.y / TILE_HEIGHT);
    const endTileX = Math.ceil((camera.x + canvas.width) / TILE_WIDTH);
    const endTileY = Math.ceil((camera.y + canvas.height) / TILE_HEIGHT);

    // Calculate the screen position of the gameplay area boundaries
    const gameplayAreaStart = worldToScreen(0, 0);
    const gameplayAreaEnd = worldToScreen(MAP_WIDTH, MAP_HEIGHT);

    // Draw the gameplay boundary indicator
    ctx.strokeStyle = BOUNDARY_INDICATOR_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(
        Math.round(gameplayAreaStart.x),
        Math.round(gameplayAreaStart.y),
        Math.round(gameplayAreaEnd.x - gameplayAreaStart.x),
        Math.round(gameplayAreaEnd.y - gameplayAreaStart.y)
    );

    // Clamp to valid tile range for the actual gameplay area
    const visibleStartX = Math.max(0, startTileX);
    const visibleStartY = Math.max(0, startTileY);
    const visibleEndX = Math.min(TILE_COUNT, endTileX);
    const visibleEndY = Math.min(TILE_COUNT, endTileY);

    // Only draw tiles that are visible
    for (let y = visibleStartY; y < visibleEndY; y++) {
        for (let x = visibleStartX; x < visibleEndX; x++) {
            // Determine which perimeter layer this tile belongs to
            // Calculate the "layer" from outside to inside (0 = outermost, 3 = innermost)
            const xLayer = Math.min(x, TILE_COUNT - 1 - x);
            const yLayer = Math.min(y, TILE_COUNT - 1 - y);
            const layer = Math.min(xLayer, yLayer);

            // Get the appropriate color from our perimeter colors array
            // Limit to available colors (0-3)
            const colorIndex = Math.min(layer, PERIMETER_COLORS.length - 1);
            const tileColor = PERIMETER_COLORS[colorIndex];

            // Calculate world position
            const worldTileX = x * TILE_WIDTH;
            const worldTileY = y * TILE_HEIGHT;

            // Convert to screen coordinates and round to whole pixels
            const rawScreenPos = worldToScreen(worldTileX, worldTileY);
            const screenPos = {
                x: Math.round(rawScreenPos.x),
                y: Math.round(rawScreenPos.y)
            };

            // Fill tile with the perimeter color
            ctx.fillStyle = tileColor;
            ctx.fillRect(screenPos.x, screenPos.y, TILE_WIDTH, TILE_HEIGHT);

            // Add subtle inner shading to create depth
            ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.fillRect(screenPos.x + 1, screenPos.y + 1, TILE_WIDTH - 2, TILE_HEIGHT - 2);

            // Add subtle highlight at the bottom-right for 3D effect
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.fillRect(screenPos.x + 3, screenPos.y + 3, TILE_WIDTH - 6, TILE_HEIGHT - 6);

            // Use filled rectangles for pixel-perfect borders

            // 1. Draw the outer dark border (10px thick) with increased overlap
            const borderThickness = 10;
            const overlapAmount = borderThickness; // Extend by full border thickness for more overlap
            ctx.fillStyle = '#222222'; // Dark gray for the outer border

            // Use Math.round for all coordinates and dimensions to ensure whole pixels
            // Top border - extend left and right
            ctx.fillRect(
                Math.round(screenPos.x - overlapAmount),
                Math.round(screenPos.y),
                Math.round(TILE_WIDTH + overlapAmount * 2),
                Math.round(borderThickness)
            );
            // Bottom border - extend left and right
            ctx.fillRect(
                Math.round(screenPos.x - overlapAmount),
                Math.round(screenPos.y + TILE_HEIGHT - borderThickness),
                Math.round(TILE_WIDTH + overlapAmount * 2),
                Math.round(borderThickness)
            );
            // Left border - extend top and bottom
            ctx.fillRect(
                Math.round(screenPos.x),
                Math.round(screenPos.y - overlapAmount),
                Math.round(borderThickness),
                Math.round(TILE_HEIGHT + overlapAmount * 2)
            );
            // Right border - extend top and bottom
            ctx.fillRect(
                Math.round(screenPos.x + TILE_WIDTH - borderThickness),
                Math.round(screenPos.y - overlapAmount),
                Math.round(borderThickness),
                Math.round(TILE_HEIGHT + overlapAmount * 2)
            );

            // 2. Draw the light gray inner border (4px thick)
            const innerBorderThickness = 4;
            const innerBorderOffset = borderThickness; // Position right after the dark border
            ctx.fillStyle = '#555555'; // Light gray for the inner border

            // Use Math.round for all coordinates and dimensions to ensure whole pixels
            // Top inner border
            ctx.fillRect(
                Math.round(screenPos.x + innerBorderOffset),
                Math.round(screenPos.y + innerBorderOffset),
                Math.round(TILE_WIDTH - innerBorderOffset * 2),
                Math.round(innerBorderThickness)
            );
            // Bottom inner border
            ctx.fillRect(
                Math.round(screenPos.x + innerBorderOffset),
                Math.round(screenPos.y + TILE_HEIGHT - innerBorderOffset - innerBorderThickness),
                Math.round(TILE_WIDTH - innerBorderOffset * 2),
                Math.round(innerBorderThickness)
            );
            // Left inner border
            ctx.fillRect(
                Math.round(screenPos.x + innerBorderOffset),
                Math.round(screenPos.y + innerBorderOffset),
                Math.round(innerBorderThickness),
                Math.round(TILE_HEIGHT - innerBorderOffset * 2)
            );
            // Right inner border
            ctx.fillRect(
                Math.round(screenPos.x + TILE_WIDTH - innerBorderOffset - innerBorderThickness),
                Math.round(screenPos.y + innerBorderOffset),
                Math.round(innerBorderThickness),
                Math.round(TILE_HEIGHT - innerBorderOffset * 2)
            );
        }
    }
}

function drawSelectionRect(ctx) {
    // Draw selection rectangle if dragging
    if (isDragging && !isAMoveMode) {
        // Convert world drag coordinates to screen coordinates
        const startScreen = worldToScreen(dragStartX, dragStartY);
        const endScreen = worldToScreen(dragEndX, dragEndY);

        ctx.strokeStyle = SELECTION_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
            startScreen.x,
            startScreen.y,
            endScreen.x - startScreen.x,
            endScreen.y - startScreen.y
        );
        ctx.setLineDash([]);
    }

    // Draw building placement preview
    if (buildingPlacementMode && buildingTypeToPlace) {
        const placementPos = worldToScreen(buildingPlacementX, buildingPlacementY);
        let size = 60; // Default size

        // Adjust size based on building type and grid cells
        if (buildingTypeToPlace === 'bunker') {
            size = GRID_CELL_WIDTH * 3; // 3x3 grid cells
        } else if (buildingTypeToPlace === 'supplyDepot') {
            // For supplyDepot, we need to handle width and height separately
            // This preview is just a placeholder, the actual drawing is done in the grid-based preview
            size = GRID_CELL_WIDTH * 3; // Width is 3 grid cells
            // Note: Height (2 grid cells) is handled in the grid-based preview
        } else if (buildingTypeToPlace === 'shieldTower') {
            size = GRID_CELL_WIDTH * 1; // 1x1 grid cells
        } else if (buildingTypeToPlace === 'sensorTower') {
            size = GRID_CELL_WIDTH * 1; // 1x1 grid cells
        }

        const halfSize = size / 2;

        // Draw placement shadow
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(placementPos.x - halfSize, placementPos.y - halfSize, size, size);

        // Draw placement border
        ctx.strokeStyle = players[currentPlayerId].color;
        ctx.lineWidth = 2;
        ctx.strokeRect(placementPos.x - halfSize, placementPos.y - halfSize, size, size);

        // Draw building type text
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(buildingTypeToPlace, placementPos.x, placementPos.y);

        // Draw cost
        const cost = BUILDING_COSTS[buildingTypeToPlace];
        ctx.fillStyle = '#4DA6FF'; // Blue color for cost
        ctx.fillText(cost.toString(), placementPos.x, placementPos.y + 20);

        // Reset context properties
        ctx.setLineDash([]);
        ctx.textAlign = 'left';
    }
}

function drawRippleEffect(ctx, now, screenX, screenY, progress, color, startRadius, ringCount, lineWidth) {
    // Make alpha fade slower (e.g., 1.0 down to 0.3)
    const baseAlpha = Math.max(0, 0.3 + 0.7 * (1.0 - progress));

    if (baseAlpha <= 0) return;

    ctx.lineWidth = lineWidth; // Apply line width
    const originalDash = ctx.getLineDash();
    const originalOffset = ctx.lineDashOffset;

    const dashOffset = -(now * RIPPLE_ROTATION_SPEED) % (RIPPLE_DASH_PATTERN[0] + RIPPLE_DASH_PATTERN[1]);
    ctx.setLineDash(RIPPLE_DASH_PATTERN);
    ctx.lineDashOffset = dashOffset;

    for (let i = 0; i < ringCount; i++) {
        const ringStartProgress = i * RIPPLE_RING_DELAY_FACTOR;
        if (progress < ringStartProgress) continue;
        const ringEffectiveDuration = 1.0 - ringStartProgress;
        if (ringEffectiveDuration <= 0) continue;
        const ringEffectiveProgress = Math.min(1.0, (progress - ringStartProgress) / ringEffectiveDuration);
        const currentRadius = startRadius * (1.0 - ringEffectiveProgress);

        // Use the modified baseAlpha directly, no per-ring alpha fade needed
        const finalAlpha = baseAlpha;
        if (currentRadius <= 0 || finalAlpha <= 0) continue;

        // Get player color and apply final alpha
        let rgbaColor = color;
        if (color.startsWith('hsl')) {
            rgbaColor = color.replace(')', `, ${finalAlpha.toFixed(3)})`).replace('hsl', 'hsla');
        } else {
            rgbaColor = `rgba(200, 200, 200, ${finalAlpha.toFixed(3)})`; // Fallback for now
        }

        // --- Draw the hollow, dotted SQUARE ---
        ctx.strokeStyle = rgbaColor;
        // Calculate square properties based on radius
        const sideLength = currentRadius * 2;
        const topLeftX = screenX - currentRadius;
        const topLeftY = screenY - currentRadius;
        // Draw the square instead of arc
        ctx.strokeRect(topLeftX, topLeftY, sideLength, sideLength);
    }

    // Restore original dash settings
    ctx.setLineDash(originalDash);
    ctx.lineDashOffset = originalOffset;
}

function drawMovementMarkers(ctx, now) {
    for (let i = movementMarkers.length - 1; i >= 0; i--) {
        const marker = movementMarkers[i];
        const elapsedTime = now - marker.timestamp;

        // Use MOVEMENT_MARKER_DURATION for both types now
        if (elapsedTime >= MOVEMENT_MARKER_DURATION) {
            movementMarkers.splice(i, 1);
            continue;
        }

        // Convert world position to screen position
        const screenPos = worldToScreen(marker.x, marker.y);

        // Skip if offscreen
        if (screenPos.x < -50 ||
            screenPos.x > canvas.width + 50 ||
            screenPos.y < -50 ||
            screenPos.y > canvas.height + 50) {
            continue;
        }

        const progress = elapsedTime / MOVEMENT_MARKER_DURATION;

        // Determine color and ring count based on marker type
        const isAttackMove = marker.isAttackMove === true;
        const markerColor = isAttackMove ? A_MOVE_MARKER_COLOR : (players[marker.playerId]?.color || 'white');
        const ringCount = isAttackMove ? A_MOVE_RIPPLE_RING_COUNT : RIPPLE_RING_COUNT;

        // Use the ripple function with determined parameters
        drawRippleEffect(
            ctx,
            now,
            screenPos.x, screenPos.y,
            progress,
            markerColor,
            MOVEMENT_MARKER_START_RADIUS * RIPPLE_START_RADIUS_FACTOR,
            ringCount,
            RIPPLE_LINE_WIDTH // Pass line width
        );
    }
}

// Draw selection rectangle and building placement preview
function drawSelectionRect(context) {
    if (isDragging) {
        const startScreen = worldToScreen(dragStartX, dragStartY);
        const endScreen = worldToScreen(dragEndX, dragEndY);

        const x = Math.min(startScreen.x, endScreen.x);
        const y = Math.min(startScreen.y, endScreen.y);
        const width = Math.abs(endScreen.x - startScreen.x);
        const height = Math.abs(endScreen.y - startScreen.y);

        context.strokeStyle = 'rgba(0, 255, 0, 0.8)';
        context.lineWidth = 2;
        context.strokeRect(x, y, width, height);
        context.fillStyle = 'rgba(0, 255, 0, 0.1)';
        context.fillRect(x, y, width, height);
    }

    // Draw building placement preview
    if (buildingPlacementMode && buildingTypeToPlace) {
        // Get mouse position in world coordinates
        const worldPos = screenToWorld(mousePos.x, mousePos.y);

        // Get building size in grid cells
        const buildingSize = BUILDING_GRID_SIZES[buildingTypeToPlace];
        const gridWidth = buildingSize.width;
        const gridHeight = buildingSize.height;

        // For multi-cell buildings, we want to center them on the cursor
        // Calculate the offset to apply to get the top-left corner
        let offsetX = 0;
        let offsetY = 0;

        if (gridWidth > 1 || gridHeight > 1) {
            // For even-sized buildings, offset by half a cell
            // For odd-sized buildings, offset by the number of cells from center
            offsetX = Math.floor(gridWidth / 2);
            offsetY = Math.floor(gridHeight / 2);
        }

        // Get the grid cell under the cursor, adjusted for building center
        const adjustedWorldX = worldPos.x - (offsetX * GRID_CELL_WIDTH);
        const adjustedWorldY = worldPos.y - (offsetY * GRID_CELL_HEIGHT);
        const cursorGridPos = worldToGrid(adjustedWorldX, adjustedWorldY);

        // Use the adjusted grid cell as the top-left corner of the building
        buildingGridX = cursorGridPos.gridX;
        buildingGridY = cursorGridPos.gridY;

        // Check if placement is valid
        isValidPlacement = isValidBuildingPlacement(buildingGridX, buildingGridY, buildingTypeToPlace);

        // For rectangular buildings like the supply depot (3x2), we need to calculate
        // the center position carefully to ensure it aligns with the grid

        // Calculate the top-left corner world position
        const topLeftWorldPos = gridToWorld(buildingGridX, buildingGridY);

        // Calculate the world width and height of the building
        const worldWidth = gridWidth * GRID_CELL_WIDTH;
        const worldHeight = gridHeight * GRID_CELL_HEIGHT;

        // Calculate the center position by adding half the width and height
        buildingPlacementX = topLeftWorldPos.x + worldWidth / 2 - GRID_CELL_WIDTH / 2;
        buildingPlacementY = topLeftWorldPos.y + worldHeight / 2 - GRID_CELL_HEIGHT / 2;

        // Store the grid coordinates for reference
        buildingPlacementGridX = buildingGridX;
        buildingPlacementGridY = buildingGridY;

        // Draw the building grid (4x4 within the inner area of each tile)
        // Calculate visible tile range based on camera position
        const startTileX = Math.floor(camera.x / TILE_WIDTH);
        const startTileY = Math.floor(camera.y / TILE_HEIGHT);
        const endTileX = Math.ceil((camera.x + canvas.width) / TILE_WIDTH);
        const endTileY = Math.ceil((camera.y + canvas.height) / TILE_HEIGHT);

        // Clamp to valid tile range
        const visibleStartX = Math.max(0, startTileX);
        const visibleStartY = Math.max(0, startTileY);
        const visibleEndX = Math.min(TILE_COUNT, endTileX);
        const visibleEndY = Math.min(TILE_COUNT, endTileY);

        // Draw grid for each visible tile
        for (let tileY = visibleStartY; tileY < visibleEndY; tileY++) {
            for (let tileX = visibleStartX; tileX < visibleEndX; tileX++) {
                // Calculate the world coordinates of the inner area of this tile
                const innerAreaX = tileX * TILE_WIDTH + INNER_TILE_OFFSET_X;
                const innerAreaY = tileY * TILE_HEIGHT + INNER_TILE_OFFSET_Y;

                // Draw the inner area boundary only during building placement
                const innerAreaScreenPos = worldToScreen(innerAreaX, innerAreaY);
                context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                context.lineWidth = 1;
                context.strokeRect(
                    innerAreaScreenPos.x,
                    innerAreaScreenPos.y,
                    ADJUSTED_INNER_TILE_WIDTH,
                    ADJUSTED_INNER_TILE_HEIGHT
                );

                // Draw horizontal grid lines within the inner area
                for (let i = 0; i <= GRID_CELLS_PER_TILE; i++) {
                    const lineWorldY = innerAreaY + i * GRID_CELL_HEIGHT;
                    const lineScreenPos = worldToScreen(innerAreaX, lineWorldY);
                    const lineEndScreenPos = worldToScreen(innerAreaX + ADJUSTED_INNER_TILE_WIDTH, lineWorldY);

                    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                    context.lineWidth = 1;
                    context.beginPath();
                    context.moveTo(lineScreenPos.x, lineScreenPos.y);
                    context.lineTo(lineEndScreenPos.x, lineScreenPos.y);
                    context.stroke();
                }

                // Draw vertical grid lines within the inner area
                for (let i = 0; i <= GRID_CELLS_PER_TILE; i++) {
                    const lineWorldX = innerAreaX + i * GRID_CELL_WIDTH;
                    const lineScreenPos = worldToScreen(lineWorldX, innerAreaY);
                    const lineEndScreenPos = worldToScreen(lineWorldX, innerAreaY + ADJUSTED_INNER_TILE_HEIGHT);

                    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                    context.lineWidth = 1;
                    context.beginPath();
                    context.moveTo(lineScreenPos.x, lineScreenPos.y);
                    context.lineTo(lineScreenPos.x, lineEndScreenPos.y);
                    context.stroke();
                }
            }
        }

        // Draw the building footprint by highlighting individual grid cells
        const footprintColor = isValidPlacement ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';

        // Draw each grid cell that would be occupied by the building
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                // Get the world position of this grid cell
                const cellWorldPos = gridToWorld(buildingGridX + x, buildingGridY + y);
                const cellScreenPos = worldToScreen(cellWorldPos.x, cellWorldPos.y);

                // Draw the cell highlight
                context.fillStyle = footprintColor;
                context.fillRect(
                    cellScreenPos.x - GRID_CELL_WIDTH/2,
                    cellScreenPos.y - GRID_CELL_HEIGHT/2,
                    GRID_CELL_WIDTH,
                    GRID_CELL_HEIGHT
                );

                // Draw the building preview on top
                context.globalAlpha = 0.5;
                context.fillStyle = players[currentPlayerId].color;
                context.fillRect(
                    cellScreenPos.x - GRID_CELL_WIDTH/2,
                    cellScreenPos.y - GRID_CELL_HEIGHT/2,
                    GRID_CELL_WIDTH,
                    GRID_CELL_HEIGHT
                );
                context.globalAlpha = 1.0;

                // Draw grid cell coordinates for debugging (optional)
                if (false) { // Set to true to enable coordinate display
                    context.fillStyle = 'white';
                    context.font = '10px Arial';
                    context.textAlign = 'center';
                    context.fillText(
                        `${buildingGridX + x},${buildingGridY + y}`,
                        cellScreenPos.x,
                        cellScreenPos.y
                    );
                }
            }
        }

        // Draw a border around the entire building footprint
        const topLeftCell = gridToWorld(buildingGridX, buildingGridY);
        const bottomRightCell = gridToWorld(buildingGridX + gridWidth - 1, buildingGridY + gridHeight - 1);

        const topLeftScreen = worldToScreen(
            topLeftCell.x - GRID_CELL_WIDTH/2,
            topLeftCell.y - GRID_CELL_HEIGHT/2
        );

        const fullWidth = gridWidth * GRID_CELL_WIDTH;
        const fullHeight = gridHeight * GRID_CELL_HEIGHT;

        context.strokeStyle = isValidPlacement ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
        context.lineWidth = 2;
        context.strokeRect(
            topLeftScreen.x,
            topLeftScreen.y,
            fullWidth,
            fullHeight
        );

        // Reset alpha
        context.globalAlpha = 1.0;

        // The buildingPlacementX/Y is already the center of the building footprint
        // from our earlier calculation, so we can use it directly
        const buildingCenterX = buildingPlacementX;
        const buildingCenterY = buildingPlacementY;

        // Draw building type text
        const centerScreenPos = worldToScreen(buildingCenterX, buildingCenterY);
        context.fillStyle = 'white';
        context.font = '14px Arial';
        context.textAlign = 'center';
        context.fillText(buildingTypeToPlace, centerScreenPos.x, centerScreenPos.y);

        // Draw debug info - show grid coordinates and world position
        if (true) { // Set to false to disable debugging
            context.fillStyle = 'yellow';
            context.font = '10px Arial';
            context.fillText(`Grid: (${buildingGridX},${buildingGridY})`, centerScreenPos.x, centerScreenPos.y + 35);
            context.fillText(`Pos: (${Math.round(buildingPlacementX)},${Math.round(buildingPlacementY)})`, centerScreenPos.x, centerScreenPos.y + 50);
        }

        // Draw cost with blue color
        const cost = BUILDING_COSTS[buildingTypeToPlace];
        context.fillStyle = '#4DA6FF'; // Blue color for cost
        context.fillText(cost.toString(), centerScreenPos.x, centerScreenPos.y + 20);
    }
}

// --- Minimap Functions ---
function drawMinimap() {
    // Clear the minimap
    minimapContext.fillStyle = '#000';
    minimapContext.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    // Draw the map background with tiles
    const minimapTileWidth = minimapCanvas.width / TILE_COUNT;
    const minimapTileHeight = minimapCanvas.height / TILE_COUNT;

    // Draw the checker pattern background
    for (let y = 0; y < TILE_COUNT; y++) {
        for (let x = 0; x < TILE_COUNT; x++) {
            // Calculate the layer (0 = outer edge, 3 = inner area)
            const layer = Math.min(x, y, TILE_COUNT - 1 - x, TILE_COUNT - 1 - y);

            // Get the color for this layer
            const tileColor = PERIMETER_COLORS[layer];

            // Calculate tile position and round to whole pixels
            const tileX = Math.round(x * minimapTileWidth);
            const tileY = Math.round(y * minimapTileHeight);
            const roundedMinimapTileWidth = Math.round(minimapTileWidth);
            const roundedMinimapTileHeight = Math.round(minimapTileHeight);

            // Draw the tile with rounded dimensions
            minimapContext.fillStyle = tileColor;
            minimapContext.fillRect(tileX, tileY, roundedMinimapTileWidth, roundedMinimapTileHeight);

            // Use filled rectangles for pixel-perfect borders on minimap

            // 1. Draw the outer dark border (2px thick) with increased overlap
            const borderThickness = 2;
            const overlapAmount = borderThickness; // Extend by full border thickness for more overlap
            minimapContext.fillStyle = '#222222'; // Dark gray for the outer border

            // Use Math.round for all coordinates and dimensions to ensure whole pixels
            // Top border - extend left and right
            minimapContext.fillRect(
                Math.round(tileX - overlapAmount),
                Math.round(tileY),
                Math.round(roundedMinimapTileWidth + overlapAmount * 2),
                Math.round(borderThickness)
            );
            // Bottom border - extend left and right
            minimapContext.fillRect(
                Math.round(tileX - overlapAmount),
                Math.round(tileY + roundedMinimapTileHeight - borderThickness),
                Math.round(roundedMinimapTileWidth + overlapAmount * 2),
                Math.round(borderThickness)
            );
            // Left border - extend top and bottom
            minimapContext.fillRect(
                Math.round(tileX),
                Math.round(tileY - overlapAmount),
                Math.round(borderThickness),
                Math.round(roundedMinimapTileHeight + overlapAmount * 2)
            );
            // Right border - extend top and bottom
            minimapContext.fillRect(
                Math.round(tileX + roundedMinimapTileWidth - borderThickness),
                Math.round(tileY - overlapAmount),
                Math.round(borderThickness),
                Math.round(roundedMinimapTileHeight + overlapAmount * 2)
            );

            // 2. Draw the light gray inner border (1px thick)
            const innerBorderThickness = 1;
            const innerBorderOffset = borderThickness; // Position right after the dark border
            minimapContext.fillStyle = '#555555'; // Light gray for the inner border

            // Use Math.round for all coordinates and dimensions to ensure whole pixels
            // Top inner border
            minimapContext.fillRect(
                Math.round(tileX + innerBorderOffset),
                Math.round(tileY + innerBorderOffset),
                Math.round(roundedMinimapTileWidth - innerBorderOffset * 2),
                Math.round(innerBorderThickness)
            );
            // Bottom inner border
            minimapContext.fillRect(
                Math.round(tileX + innerBorderOffset),
                Math.round(tileY + roundedMinimapTileHeight - innerBorderOffset - innerBorderThickness),
                Math.round(roundedMinimapTileWidth - innerBorderOffset * 2),
                Math.round(innerBorderThickness)
            );
            // Left inner border
            minimapContext.fillRect(
                Math.round(tileX + innerBorderOffset),
                Math.round(tileY + innerBorderOffset),
                Math.round(innerBorderThickness),
                Math.round(roundedMinimapTileHeight - innerBorderOffset * 2)
            );
            // Right inner border
            minimapContext.fillRect(
                Math.round(tileX + roundedMinimapTileWidth - innerBorderOffset - innerBorderThickness),
                Math.round(tileY + innerBorderOffset),
                Math.round(innerBorderThickness),
                Math.round(roundedMinimapTileHeight - innerBorderOffset * 2)
            );
        }
    }

    // Draw game objects
    for (const obj of gameObjects) {
        if (obj.health <= 0) continue;

        // Calculate minimap position
        const minimapX = obj.x * minimapScale;
        const minimapY = obj.y * minimapScale;

        // Set fill color
        minimapContext.fillStyle = obj.color;
        minimapContext.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        minimapContext.lineWidth = 0.5;

        // Draw different shapes based on object type
        if (obj.type === 'bunker' || obj.type === 'supplyDepot' ||
            obj.type === 'shieldTower' || obj.type === 'sensorTower') {
            // Draw buildings as squares
            const size = 6; // Size for buildings
            minimapContext.fillRect(minimapX - size/2, minimapY - size/2, size, size);
            minimapContext.strokeRect(minimapX - size/2, minimapY - size/2, size, size);
        }
        else if (obj.type === 'worker') {
            // Draw workers as diamonds
            const size = 5;
            minimapContext.beginPath();
            minimapContext.moveTo(minimapX, minimapY - size/2); // Top
            minimapContext.lineTo(minimapX + size/2, minimapY); // Right
            minimapContext.lineTo(minimapX, minimapY + size/2); // Bottom
            minimapContext.lineTo(minimapX - size/2, minimapY); // Left
            minimapContext.closePath();
            minimapContext.fill();
            minimapContext.stroke();
        }
        else {
            // Draw units (marines) as triangles
            const size = 5;
            minimapContext.beginPath();
            minimapContext.moveTo(minimapX, minimapY - size/2); // Top
            minimapContext.lineTo(minimapX + size/2, minimapY + size/2); // Bottom right
            minimapContext.lineTo(minimapX - size/2, minimapY + size/2); // Bottom left
            minimapContext.closePath();
            minimapContext.fill();
            minimapContext.stroke();
        }
    }

    // Draw camera viewport rectangle
    const viewportX = camera.x * minimapScale;
    const viewportY = camera.y * minimapScale;
    const viewportWidth = canvas.width * minimapScale;
    const viewportHeight = canvas.height * minimapScale;

    minimapContext.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    minimapContext.lineWidth = 1;
    minimapContext.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);

    // Add a subtle glow effect to the viewport rectangle
    minimapContext.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    minimapContext.lineWidth = 2;
    minimapContext.strokeRect(viewportX - 1, viewportY - 1, viewportWidth + 2, viewportHeight + 2);
}

// Handle minimap clicks
minimapCanvas.addEventListener('mousedown', (event) => {
    const rect = minimapCanvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Convert minimap coordinates to world coordinates
    const worldX = clickX / minimapScale;
    const worldY = clickY / minimapScale;

    // Center the camera on the clicked point
    camera.x = worldX - canvas.width / 2;
    camera.y = worldY - canvas.height / 2;

    // Constrain camera to visual map boundaries (still allowing panning into the extended area)
    camera.x = Math.max(-VISUAL_BOUNDARY_EXTENSION, Math.min(camera.x, MAP_WIDTH + VISUAL_BOUNDARY_EXTENSION - canvas.width));
    camera.y = Math.max(-VISUAL_BOUNDARY_EXTENSION, Math.min(camera.y, MAP_HEIGHT + VISUAL_BOUNDARY_EXTENSION - canvas.height));
});

// --- Resource Gain Functions ---
function createResourceGainText(x, y, amount, isBuilding = false, playerId = currentPlayerId) {
    const text = `+${amount}`;
    const font = isBuilding ? RESOURCE_TEXT_FONT_BUILDING : RESOURCE_TEXT_FONT_UNIT;
    const playerColor = players[playerId].color;
    floatingTexts.push(new FloatingText(x, y, text, playerColor, font, RESOURCE_TEXT_DURATION));
}

function updateFloatingTexts(now, ctx) {
    // Update and draw floating texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const text = floatingTexts[i];
        // Update returns false when the text has expired
        if (!text.update(now)) {
            // Remove expired text
            floatingTexts.splice(i, 1);
        } else {
            // Draw active text
            text.draw(ctx);
        }
    }
}

// --- Rendering Functions ---
function executeDrawCommand(ctx, command) {
    const now = performance.now();

    switch (command.type) {
        case 'text':
            // Convert world to screen coordinates
            const textScreenPos = worldToScreen(command.x, command.y);

            ctx.fillStyle = command.color || 'white';
            ctx.font = command.font || '10px Arial';
            ctx.textAlign = command.textAlign || 'center';
            ctx.fillText(command.content, textScreenPos.x, textScreenPos.y);
            break;

        case 'healthBar':
            // Use the camera-aware draw health bar function
            drawHealthBar(
                ctx,
                command.centerX,
                command.topY,
                command.currentHealth,
                command.maxHealth,
                command.width,
                command.height,
                command.basePlayerColor
            );
            break;

        case 'rally':
            const startScreenPos = worldToScreen(command.startX, command.startY);
            const endScreenPos = worldToScreen(command.endX, command.endY);

            const originalRallyDash = ctx.getLineDash();
            const originalRallyOffset = ctx.lineDashOffset;
            const originalRallyLineWidth = ctx.lineWidth;
            const originalRallyStrokeStyle = ctx.strokeStyle;

            ctx.strokeStyle = command.color || 'lime';
            ctx.lineWidth = command.lineWidth || 1;
            if (command.lineDash) ctx.setLineDash(command.lineDash);
            if (command.lineDashOffset !== undefined) ctx.lineDashOffset = command.lineDashOffset;

            ctx.beginPath();
            ctx.moveTo(startScreenPos.x, startScreenPos.y);
            ctx.lineTo(endScreenPos.x, endScreenPos.y);
            ctx.stroke();
            ctx.setLineDash(originalRallyDash);
            ctx.lineDashOffset = originalRallyOffset;

            // --- Draw Looping Rally Ripple Marker ---
            const pulseTime = now % command.pulseDuration;
            const pulseProgress = pulseTime / command.pulseDuration;
            const playerColor = players[command.playerId]?.color || 'lime';

            drawRippleEffect(
                ctx,
                now,
                endScreenPos.x, endScreenPos.y,
                pulseProgress,
                playerColor,
                command.rippleStartRadius,
                RIPPLE_RING_COUNT,
                RIPPLE_LINE_WIDTH // Pass line width
            );

            // Restore context state
            ctx.lineWidth = originalRallyLineWidth;
            ctx.strokeStyle = originalRallyStrokeStyle;
            break;

        case 'rangeCircle':
            const rangeCircleScreenPos = worldToScreen(command.x, command.y);

            const originalDash = ctx.getLineDash();
            const originalOffset = ctx.lineDashOffset;

            ctx.strokeStyle = command.color || 'rgba(255,0,0,0.3)';
            ctx.lineWidth = 1;
            if (command.lineDash) {
                ctx.setLineDash(command.lineDash);
            }
            if (command.lineDashOffset) {
                ctx.lineDashOffset = command.lineDashOffset;
            }
            ctx.beginPath();
            ctx.arc(rangeCircleScreenPos.x, rangeCircleScreenPos.y, command.radius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.setLineDash(originalDash);
            ctx.lineDashOffset = originalOffset;
            break;

        case 'rangeSquare':
            const rangeSquareScreenPos = worldToScreen(command.x, command.y);

            // Draw a square instead of a circle for better performance
            ctx.strokeStyle = command.color || 'rgba(255,0,0,0.3)';
            ctx.lineWidth = 1;

            // Calculate the square dimensions based on the radius
            const squareSize = command.radius * 2;

            // Draw the square centered on the unit
            ctx.strokeRect(
                rangeSquareScreenPos.x - command.radius,
                rangeSquareScreenPos.y - command.radius,
                squareSize,
                squareSize
            );
            break;

        default:
            console.warn(`Unknown draw command type: ${command.type}`);
    }
}

function drawAttackEffects(ctx, now) {
    // Save original ctx state
    const originalStrokeStyle = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;

    // Process attack effects
    for (let i = attackEffects.length - 1; i >= 0; i--) {
        const effect = attackEffects[i];
        const elapsedTime = now - effect.timestamp;

        // Remove effects that have exceeded their duration
        if (elapsedTime >= effect.duration) {
            attackEffects.splice(i, 1);
            continue;
        }

        // Calculate alpha (fade out)
        const alpha = 1.0 - (elapsedTime / effect.duration);

        if (effect.type === 'laser') {
            // Convert world coordinates to screen coordinates
            const startScreen = worldToScreen(effect.startX, effect.startY);
            const endScreen = worldToScreen(effect.endX, effect.endY);

            // Skip if both points are offscreen
            if ((startScreen.x < 0 && endScreen.x < 0) ||
                (startScreen.x > canvas.width && endScreen.x > canvas.width) ||
                (startScreen.y < 0 && endScreen.y < 0) ||
                (startScreen.y > canvas.height && endScreen.y > canvas.height)) {
                continue;
            }

            // Use player color for the laser instead of red
            let laserColor = effect.color || 'rgba(255, 0, 0, 1)';

            // Convert HSL color to HSLA with alpha
            if (laserColor.startsWith('hsl')) {
                laserColor = laserColor.replace(')', `, ${alpha})`).replace('hsl', 'hsla');
            } else {
                // For any other color format, just use rgba red as fallback
                laserColor = `rgba(255, 0, 0, ${alpha})`;
            }

            // Draw laser line with player color and alpha
            ctx.strokeStyle = laserColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(startScreen.x, startScreen.y);
            ctx.lineTo(endScreen.x, endScreen.y);
            ctx.stroke();
        }
        else if (effect.type === 'burst') {
            // Convert world coordinates to screen coordinates
            const screenPos = worldToScreen(effect.x, effect.y);

            // Skip if offscreen
            if (screenPos.x < -10 ||
                screenPos.x > canvas.width + 10 ||
                screenPos.y < -10 ||
                screenPos.y > canvas.height + 10) {
                continue;
            }

            const sparkAlpha = alpha * 0.8; // Slightly more transparent than the laser

            // Set spark color
            ctx.strokeStyle = `rgba(255, 255, 255, ${sparkAlpha})`;
            ctx.lineWidth = 1;

            // Draw several spark lines
            for (let j = 0; j < SPARK_COUNT; j++) {
                const angle = Math.random() * Math.PI * 2; // Random angle
                const length = Math.random() * SPARK_LENGTH + 2; // Random length

                const sparkEndX = screenPos.x + Math.cos(angle) * length;
                const sparkEndY = screenPos.y + Math.sin(angle) * length;

                ctx.beginPath();
                ctx.moveTo(screenPos.x, screenPos.y);
                ctx.lineTo(sparkEndX, sparkEndY);
                ctx.stroke();
            }
        }
    }

    // Restore original context state
    ctx.strokeStyle = originalStrokeStyle;
    ctx.lineWidth = originalLineWidth;
}

// Performance Monitor Functions
function updatePerformanceMetrics(now) {
    // Calculate frame time
    const frameTime = now - lastFrameTime;
    lastFrameTime = now;

    // Store frame time for FPS calculation
    frameTimes.push(frameTime);
    if (frameTimes.length > FPS_SAMPLE_SIZE) {
        frameTimes.shift();
    }

    // Update display every PERFORMANCE_UPDATE_INTERVAL
    if (now - lastPerformanceUpdate >= PERFORMANCE_UPDATE_INTERVAL) {
        // Calculate average FPS
        const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        const fps = Math.round(1000 / avgFrameTime);

        // Update FPS display
        fpsCounter.textContent = fps;

        // Update frame time display
        frameTimeElement.textContent = Math.round(frameTime);

        // Update memory usage if available
        if (performance.memory) {
            const memoryMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
            memoryUsageElement.textContent = memoryMB;
        } else {
            memoryUsageElement.textContent = 'N/A';
        }

        lastPerformanceUpdate = now;
    }
}

function togglePerformanceMonitor() {
    isPerformanceMonitorVisible = !isPerformanceMonitorVisible;
    performanceMonitor.classList.toggle('hidden', !isPerformanceMonitorVisible);
}

function togglePlayerControls() {
    isPlayerControlsVisible = !isPlayerControlsVisible;
    playerControls.classList.toggle('hidden', !isPlayerControlsVisible);
}

// Helper function to find nearest enemy in range
function findNearestEnemyInRange(unit, range, allGameObjects) {
    // Check if this unit is valid
    if (!unit || unit.health <= 0) return null;

    let nearestEnemy = null;
    let nearestDistance = Infinity;

    allGameObjects.forEach(obj => {
        // Skip self, allies or dead objects
        if (obj === unit || obj.health <= 0 || areAllies(unit.playerId, obj.playerId)) return;

        const distance = Math.hypot(obj.x - unit.x, obj.y - unit.y);
        // Check if within range and closer than current nearest
        if (distance <= range && distance < nearestDistance) {
            nearestEnemy = obj;
            nearestDistance = distance;
        }
    });

    return nearestEnemy;
}

// UI System is always visible, no toggle needed

// Function to update resource and supply display
function updateResourceSupplyDisplay() {
    const playerState = players[currentPlayerId];
    if (!playerState) return;

    // Update resource display
    const resourceValueElement = document.getElementById('resourceValue');
    if (resourceValueElement) {
        resourceValueElement.textContent = playerState.resources;
    }

    // Update supply display
    const supplyValueElement = document.getElementById('supplyValue');
    if (supplyValueElement) {
        supplyValueElement.textContent = `${playerState.currentSupply}/${playerState.supplyCap}`;
    }
}

// Function to update upgrade levels in the UI
function updateUpgradeLevels() {
    const upgrades = playerUpgrades[currentPlayerId];
    if (!upgrades) return;

    // Get all upgrade level indicators on page 4
    const page4 = document.querySelector('.ui-page[data-page="4"]');
    if (!page4) return;

    // Update armor upgrade level (Q button)
    const armorLevelElement = page4.querySelector('.ui-grid-button[data-action="action-q-p4"] .ui-upgrade-level');
    if (armorLevelElement) {
        armorLevelElement.textContent = upgrades.armor;

        // Update tooltip with new price
        const button = armorLevelElement.closest('.ui-grid-button');
        if (button) {
            const newPrice = getUpgradePrice(upgrades.armor);
            button.dataset.tooltip = `Armor: <span class="upgrade-price">${newPrice}</span>`;
        }
    }

    // Update attack damage upgrade level (W button)
    const attackDamageLevelElement = page4.querySelector('.ui-grid-button[data-action="action-w-p4"] .ui-upgrade-level');
    if (attackDamageLevelElement) {
        attackDamageLevelElement.textContent = upgrades.attackDamage;

        // Update tooltip with new price
        const button = attackDamageLevelElement.closest('.ui-grid-button');
        if (button) {
            const newPrice = getUpgradePrice(upgrades.attackDamage);
            button.dataset.tooltip = `Attack Damage: <span class="upgrade-price">${newPrice}</span>`;
        }
    }

    // Update weapon range upgrade level (E button)
    const weaponRangeLevelElement = page4.querySelector('.ui-grid-button[data-action="action-e-p4"] .ui-upgrade-level');
    if (weaponRangeLevelElement) {
        weaponRangeLevelElement.textContent = upgrades.weaponRange;

        // Update tooltip with new price
        const button = weaponRangeLevelElement.closest('.ui-grid-button');
        if (button) {
            const newPrice = getUpgradePrice(upgrades.weaponRange);
            button.dataset.tooltip = `Weapon Range: <span class="upgrade-price">${newPrice}</span>`;
        }
    }

    // Update health regen upgrade level (R button)
    const healthRegenLevelElement = page4.querySelector('.ui-grid-button[data-action="action-r-p4"] .ui-upgrade-level');
    if (healthRegenLevelElement) {
        healthRegenLevelElement.textContent = upgrades.healthRegen;

        // Update tooltip with new price
        const button = healthRegenLevelElement.closest('.ui-grid-button');
        if (button) {
            const newPrice = getUpgradePrice(upgrades.healthRegen);
            button.dataset.tooltip = `Health Regen: <span class="upgrade-price">${newPrice}</span>`;
        }
    }

    // Update movement speed upgrade level (T button)
    const movementSpeedLevelElement = page4.querySelector('.ui-grid-button[data-action="action-t-p4"] .ui-upgrade-level');
    if (movementSpeedLevelElement) {
        movementSpeedLevelElement.textContent = upgrades.movementSpeed;

        // Update tooltip with new price
        const button = movementSpeedLevelElement.closest('.ui-grid-button');
        if (button) {
            const newPrice = getUpgradePrice(upgrades.movementSpeed);
            button.dataset.tooltip = `Movement Speed: <span class="upgrade-price">${newPrice}</span>`;
        }
    }
}

// Function to update resources (passive income)
function updateResources(now) {
    if (now - lastResourceUpdateTime >= resourceUpdateInterval) {
        // Add resources to all players
        Object.keys(players).forEach(playerId => {
            players[playerId].resources += resourceIncomeRate;
        });

        lastResourceUpdateTime = now;

        // Update the display
        updateResourceSupplyDisplay();
    }
}

// Function to update the game timer
function updateGameTimer() {
    // Calculate elapsed time in seconds
    gameTimeInSeconds = Math.floor((Date.now() - gameStartTime) / 1000);

    // Convert to minutes and seconds
    const minutes = Math.floor(gameTimeInSeconds / 60);
    const seconds = gameTimeInSeconds % 60;

    // Format with leading zeros
    const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Update the timer display
    gameTimerElement.textContent = formattedTime;
}

// Simple game loop
function gameLoop() {
    const now = performance.now();

    // Update performance metrics
    updatePerformanceMetrics(now);

    // Update resources (passive income)
    updateResources(now);

    // Update game timer
    updateGameTimer();

    // Update edge scrolling
    updateEdgeScrolling();

    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(context);

    // 1. Update game object states
    gameObjects.forEach(obj => {
        if (obj.update) {
            if (obj.type === 'bunker') {
                if (typeof obj.update === 'function') {
                    obj.update(now, gameObjects, players);
                }
            } else if (obj.type === 'unit' || obj.type === 'marine' || obj.type === 'worker') {
                if (typeof obj.update === 'function') {
                    obj.update(now, gameObjects);
                }
            }
        }
    });

    // 2. Resolve collisions
    resolveUnitCollisions(gameObjects);

    // Safety clamp after collisions
    gameObjects.forEach(obj => {
        if (obj.type === 'unit' || obj.type === 'marine' || obj.type === 'worker') { // Only clamp units
            const halfSize = obj.size / 2;
            obj.x = Math.max(halfSize, Math.min(MAP_WIDTH - halfSize, obj.x));
            obj.y = Math.max(halfSize, Math.min(MAP_HEIGHT - halfSize, obj.y));
        }
    });

    // 3. Handle deaths and target cleanup + Supply Update
    const livingObjects = [];

    gameObjects.forEach(obj => {
        if (obj.health > 0) {
            livingObjects.push(obj);
        } else {
            // Object died
            console.log(`${obj.type} ${obj.id} belonging to Player ${obj.playerId} died.`);

            // Find the killer (last unit that attacked this object)
            let killer = null;
            gameObjects.forEach(attacker => {
                if (attacker.targetUnit && attacker.targetUnit.id === obj.id) {
                    killer = attacker;
                    attacker.targetUnit = null;
                    if (attacker.commandState === 'attacking') attacker.commandState = 'idle';
                }
            });

            // Award resources to the killer's player if it's an enemy kill
            if (killer && !areAllies(killer.playerId, obj.playerId)) {
                const killerPlayerId = killer.playerId;
                const killerPlayerState = players[killerPlayerId];

                let resourceAmount = 0;
                let isBuilding = false;

                // Determine resource amount based on object type
                if (obj.type === 'marine' || obj.type === 'worker' || obj.type === 'unit') {
                    resourceAmount = RESOURCE_GAIN_UNIT;
                } else if (obj.type === 'bunker') {
                    resourceAmount = RESOURCE_GAIN_BUNKER;
                    isBuilding = true;
                } else if (obj.type === 'supplyDepot') {
                    resourceAmount = RESOURCE_GAIN_SUPPLY_DEPOT;
                    isBuilding = true;
                } else if (obj.type === 'shieldTower' || obj.type === 'sensorTower') {
                    resourceAmount = RESOURCE_GAIN_TOWER;
                    isBuilding = true;
                }

                // Award resources and create floating text
                if (resourceAmount > 0) {
                    killerPlayerState.resources += resourceAmount;

                    // Only show floating text for the current player's kills
                    if (killerPlayerId === currentPlayerId) {
                        createResourceGainText(obj.x, obj.y, resourceAmount, isBuilding, killerPlayerId);
                        updateResourceSupplyDisplay();
                    }

                    console.log(`Player ${killerPlayerId} gained ${resourceAmount} resources for killing ${obj.type}`);
                }
            }

            // Handle supply changes
            if (obj.type === 'unit' || obj.type === 'marine' || obj.type === 'worker') {
                const playerState = players[obj.playerId];
                if (playerState) {
                     playerState.currentSupply = Math.max(0, playerState.currentSupply - obj.supplyCost);
                     console.log(`Player ${obj.playerId} supply decreased. New supply: ${playerState.currentSupply}/${playerState.supplyCap}`);
                 }
                selectedUnits = selectedUnits.filter(selected => selected.id !== obj.id);
            }
        }
    });
    gameObjects.length = 0;
    gameObjects.push(...livingObjects);
    gameObjects.forEach(obj => {
        if (obj.targetUnit && obj.targetUnit.health <= 0) {
            obj.targetUnit = null;
            if (obj.commandState === 'attacking') obj.commandState = 'idle';
        }
    });

    // --- Rendering ---
    const uiDrawQueue = [];

    // Pass 1: Draw bodies and collect UI commands
    gameObjects.forEach(obj => {
        const isSelected = selectedUnits.some(sel => sel.id === obj.id);
        if (obj.drawBody) obj.drawBody(context, isSelected);
        if (obj.getUIDrawCommands) {
            uiDrawQueue.push(...obj.getUIDrawCommands(isSelected));
        }
    });

    // Draw Attack Effects (after bodies, before UI?)
    drawAttackEffects(context, now);

    // Update and draw floating texts
    updateFloatingTexts(now, context);

    // Pass 2: Draw UI elements from the queue
    // Reset context properties that might interfere
    context.textAlign = 'center';
    context.setLineDash([]); // Clear line dashing

    // Execute each command from the UI draw queue
    uiDrawQueue.forEach(command => {
        executeDrawCommand(context, command);
    });

    // Draw the minimap
    drawMinimap();

    // 4. Draw selection rectangle
    drawSelectionRect(context);

    // 5. Draw movement markers
    drawMovementMarkers(context, now);

    // Request next frame
    requestAnimationFrame(gameLoop);
}

// --- Initial Setup ---
window.addEventListener('load', () => {
    // No need to call resizeCanvas anymore
    // resizeCanvas();
    setupGame();

    // Initialize UI System
    initializeUISystem();

    gameLoop();
});

// Initialize the UI System with action handlers
function initializeUISystem() {
    // Use the global UISystem class
    uiSystem = new window.UISystem();

    // Set up action handlers for the UI buttons
    // Page 1 - Combat Actions
    uiSystem.setActionHandler('action-q', () => console.log('Attack command'));
    uiSystem.setActionHandler('action-w', () => console.log('Defend command'));
    uiSystem.setActionHandler('action-e', () => console.log('Range attack command'));
    uiSystem.setActionHandler('action-r', () => console.log('Special ability command'));
    uiSystem.setActionHandler('action-t', () => console.log('Ultimate ability command'));

    uiSystem.setActionHandler('action-a', () => {
        console.log('A-Move command');
        if (selectedUnits.some(unit => unit.type === 'marine' && unit.playerId === currentPlayerId)) {
            isAMoveMode = true;
        }
    });

    // Set up other action handlers for page 1
    uiSystem.setActionHandler('action-s', () => console.log('Stop command'));
    uiSystem.setActionHandler('action-d', () => console.log('Hold position command'));
    uiSystem.setActionHandler('action-f', () => console.log('Patrol command'));
    uiSystem.setActionHandler('action-g', () => console.log('Guard command'));
    uiSystem.setActionHandler('action-z', () => console.log('Formation 1 command'));
    uiSystem.setActionHandler('action-x', () => console.log('Formation 2 command'));
    uiSystem.setActionHandler('action-c', () => console.log('Formation 3 command'));
    uiSystem.setActionHandler('action-v', () => console.log('Formation 4 command'));
    uiSystem.setActionHandler('action-b', () => console.log('Formation 5 command'));

    // Page 2 - Building Actions
    uiSystem.setActionHandler('action-q-p2', () => console.log('Build house command'));
    uiSystem.setActionHandler('action-w-p2', () => console.log('Build factory command'));
    uiSystem.setActionHandler('action-e-p2', () => console.log('Build barracks command'));
    uiSystem.setActionHandler('action-r-p2', () => console.log('Build tower command'));
    uiSystem.setActionHandler('action-t-p2', () => console.log('Build wall command'));

    // Set up other action handlers for page 2
    uiSystem.setActionHandler('action-a-p2', () => console.log('Build farm command'));
    uiSystem.setActionHandler('action-s-p2', () => console.log('Build mine command'));
    uiSystem.setActionHandler('action-d-p2', () => console.log('Build workshop command'));
    uiSystem.setActionHandler('action-f-p2', () => console.log('Build laboratory command'));
    uiSystem.setActionHandler('action-g-p2', () => console.log('Build market command'));
    uiSystem.setActionHandler('action-z-p2', () => console.log('Upgrade building command'));
    uiSystem.setActionHandler('action-x-p2', () => console.log('Repair building command'));
    uiSystem.setActionHandler('action-c-p2', () => console.log('Demolish building command'));
    uiSystem.setActionHandler('action-v-p2', () => console.log('Rotate building command'));
    uiSystem.setActionHandler('action-b-p2', () => console.log('Cancel building command'));

    // Page 3 - Worker Building Actions

    // Build Bunker (Q)
    uiSystem.setActionHandler('action-q-p3', () => {
        console.log('Build bunker command');
        if (selectedUnits.some(unit => unit.type === 'worker' && unit.playerId === currentPlayerId)) {
            // Get all selected workers
            const workers = selectedUnits.filter(unit => unit.type === 'worker' && unit.playerId === currentPlayerId);
            if (workers.length > 0) {
                // Start building placement mode with the first worker
                const firstWorker = workers[0];
                if (firstWorker.startBuildingPlacement('bunker')) {
                    // Store all workers for later use
                    buildingWorkers = workers;
                }
            }
        }
    });

    // Build Supply Depot (W)
    uiSystem.setActionHandler('action-w-p3', () => {
        console.log('Build supply depot command');
        if (selectedUnits.some(unit => unit.type === 'worker' && unit.playerId === currentPlayerId)) {
            // Get all selected workers
            const workers = selectedUnits.filter(unit => unit.type === 'worker' && unit.playerId === currentPlayerId);
            if (workers.length > 0) {
                // Start building placement mode with the first worker
                const firstWorker = workers[0];
                if (firstWorker.startBuildingPlacement('supplyDepot')) {
                    // Store all workers for later use
                    buildingWorkers = workers;
                }
            }
        }
    });

    // Build Shield Tower (E)
    uiSystem.setActionHandler('action-e-p3', () => {
        console.log('Build shield tower command');
        if (selectedUnits.some(unit => unit.type === 'worker' && unit.playerId === currentPlayerId)) {
            // Get all selected workers
            const workers = selectedUnits.filter(unit => unit.type === 'worker' && unit.playerId === currentPlayerId);
            if (workers.length > 0) {
                // Start building placement mode with the first worker
                const firstWorker = workers[0];
                if (firstWorker.startBuildingPlacement('shieldTower')) {
                    // Store all workers for later use
                    buildingWorkers = workers;
                }
            }
        }
    });

    // Build Sensor Tower (R)
    uiSystem.setActionHandler('action-r-p3', () => {
        console.log('Build sensor tower command');
        if (selectedUnits.some(unit => unit.type === 'worker' && unit.playerId === currentPlayerId)) {
            // Get all selected workers
            const workers = selectedUnits.filter(unit => unit.type === 'worker' && unit.playerId === currentPlayerId);
            if (workers.length > 0) {
                // Start building placement mode with the first worker
                const firstWorker = workers[0];
                if (firstWorker.startBuildingPlacement('sensorTower')) {
                    // Store all workers for later use
                    buildingWorkers = workers;
                }
            }
        }
    });

    // Cancel Building (T)
    uiSystem.setActionHandler('action-t-p3', () => {
        console.log('Cancel building command');
        // Exit building placement mode
        buildingPlacementMode = false;
        buildingTypeToPlace = null;
        buildingWorkers = [];
    });
    uiSystem.setActionHandler('action-a-p3', () => console.log('Build command 6'));
    uiSystem.setActionHandler('action-s-p3', () => console.log('Build command 7'));
    uiSystem.setActionHandler('action-d-p3', () => console.log('Build command 8'));
    uiSystem.setActionHandler('action-f-p3', () => console.log('Build command 9'));
    uiSystem.setActionHandler('action-g-p3', () => console.log('Build command 10'));
    uiSystem.setActionHandler('action-z-p3', () => console.log('Build command 11'));
    uiSystem.setActionHandler('action-x-p3', () => console.log('Build command 12'));
    uiSystem.setActionHandler('action-c-p3', () => console.log('Build command 13'));
    uiSystem.setActionHandler('action-v-p3', () => console.log('Build command 14'));
    uiSystem.setActionHandler('action-b-p3', () => console.log('Build command 15'));

    // Page 4 - Unit Upgrades
    // Armor Upgrade (Q)
    uiSystem.setActionHandler('action-q-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.armor;
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            // Deduct resources
            playerState.resources -= price;

            // Increase upgrade level
            upgrades.armor++;

            // Update all player units with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'marine' || obj.type === 'worker') && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            // Update UI
            updateResourceSupplyDisplay();
            updateUpgradeLevels();

            console.log(`Armor upgraded to level ${upgrades.armor} for Player ${currentPlayerId}`);
        } else {
            console.log(`Not enough resources for armor upgrade. Need ${price}, have ${playerState.resources}`);
        }
    });

    // Attack Damage Upgrade (W)
    uiSystem.setActionHandler('action-w-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.attackDamage;
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            // Deduct resources
            playerState.resources -= price;

            // Increase upgrade level
            upgrades.attackDamage++;

            // Update all player units with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'marine' || obj.type === 'worker') && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            // Update UI
            updateResourceSupplyDisplay();
            updateUpgradeLevels();

            console.log(`Attack Damage upgraded to level ${upgrades.attackDamage} for Player ${currentPlayerId}`);
        } else {
            console.log(`Not enough resources for attack damage upgrade. Need ${price}, have ${playerState.resources}`);
        }
    });

    // Weapon Range Upgrade (E)
    uiSystem.setActionHandler('action-e-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.weaponRange;
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            // Deduct resources
            playerState.resources -= price;

            // Increase upgrade level
            upgrades.weaponRange++;

            // Update all player units with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'marine' || obj.type === 'worker') && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            // Update UI
            updateResourceSupplyDisplay();
            updateUpgradeLevels();

            console.log(`Weapon Range upgraded to level ${upgrades.weaponRange} for Player ${currentPlayerId}`);
        } else {
            console.log(`Not enough resources for weapon range upgrade. Need ${price}, have ${playerState.resources}`);
        }
    });

    // Health Regen Upgrade (R)
    uiSystem.setActionHandler('action-r-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.healthRegen;
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            // Deduct resources
            playerState.resources -= price;

            // Increase upgrade level
            upgrades.healthRegen++;

            // Update all player units with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'marine' || obj.type === 'worker') && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            // Update UI
            updateResourceSupplyDisplay();
            updateUpgradeLevels();

            console.log(`Health Regen upgraded to level ${upgrades.healthRegen} for Player ${currentPlayerId}`);
        } else {
            console.log(`Not enough resources for health regen upgrade. Need ${price}, have ${playerState.resources}`);
        }
    });

    // Movement Speed Upgrade (T)
    uiSystem.setActionHandler('action-t-p4', () => {
        const playerState = players[currentPlayerId];
        const upgrades = playerUpgrades[currentPlayerId];
        const upgradeLevel = upgrades.movementSpeed;
        const price = getUpgradePrice(upgradeLevel);

        if (playerState.resources >= price) {
            // Deduct resources
            playerState.resources -= price;

            // Increase upgrade level
            upgrades.movementSpeed++;

            // Update all player units with new stats
            gameObjects.forEach(obj => {
                if ((obj.type === 'marine' || obj.type === 'worker') && obj.playerId === currentPlayerId) {
                    applyUpgradesToUnit(obj);
                }
            });

            // Update UI
            updateResourceSupplyDisplay();
            updateUpgradeLevels();

            console.log(`Movement Speed upgraded to level ${upgrades.movementSpeed} for Player ${currentPlayerId}`);
        } else {
            console.log(`Not enough resources for movement speed upgrade. Need ${price}, have ${playerState.resources}`);
        }
    });

    // UI system is always visible
    uiSystem.show();
}
