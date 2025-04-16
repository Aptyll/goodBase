// UI System for Game
class UISystem {
    constructor() {
        // State
        this.isUIVisible = true; // Always visible
        this.currentPage = 1;

        // Create DOM elements
        this.createUIElements();

        // Set up event listeners
        this.setupEventListeners();

        // Action handlers - these will be customized for your game
        this.actionHandlers = {
            // Page 1 actions
            'action-q': () => console.log('Action Q triggered'),
            'action-w': () => console.log('Action W triggered'),
            'action-e': () => console.log('Action E triggered'),
            'action-r': () => console.log('Action R triggered'),
            'action-t': () => console.log('Action T triggered'),
            'action-a': () => console.log('Action A triggered'),
            'action-s': () => console.log('Action S triggered'),
            'action-d': () => console.log('Action D triggered'),
            'action-f': () => console.log('Action F triggered'),
            'action-g': () => console.log('Action G triggered'),
            'action-z': () => console.log('Action Z triggered'),
            'action-x': () => console.log('Action X triggered'),
            'action-c': () => console.log('Action C triggered'),
            'action-v': () => console.log('Action V triggered'),
            'action-b': () => console.log('Action B triggered'),

            // Page 2 actions
            'action-q-p2': () => console.log('Page 2 - Action Q triggered'),
            'action-w-p2': () => console.log('Page 2 - Action W triggered'),
            'action-e-p2': () => console.log('Page 2 - Action E triggered'),
            'action-r-p2': () => console.log('Page 2 - Action R triggered'),
            'action-t-p2': () => console.log('Page 2 - Action T triggered'),
            'action-a-p2': () => console.log('Page 2 - Action A triggered'),
            'action-s-p2': () => console.log('Page 2 - Action S triggered'),
            'action-d-p2': () => console.log('Page 2 - Action D triggered'),
            'action-f-p2': () => console.log('Page 2 - Action F triggered'),
            'action-g-p2': () => console.log('Page 2 - Action G triggered'),
            'action-z-p2': () => console.log('Page 2 - Action Z triggered'),
            'action-x-p2': () => console.log('Page 2 - Action X triggered'),
            'action-c-p2': () => console.log('Page 2 - Action C triggered'),
            'action-v-p2': () => console.log('Page 2 - Action V triggered'),
            'action-b-p2': () => console.log('Page 2 - Action B triggered'),
        };
    }

    createUIElements() {
        // Create the main container
        this.uiContainer = document.createElement('div');
        this.uiContainer.id = 'ui-system';
        this.uiContainer.className = 'hidden';

        // Create CSS
        const style = document.createElement('style');
        style.textContent = `
            #ui-system {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background-color: rgba(0, 0, 0, 0.7);
                border-radius: 8px;
                padding: 10px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
                transition: opacity 0.3s ease;
                z-index: 1000;
            }

            #ui-system.hidden {
                opacity: 0;
                pointer-events: none;
            }

            #ui-page-tabs {
                display: flex;
                gap: 5px;
                margin-bottom: 10px;
            }

            .ui-page-tab {
                width: 40px;
                height: 40px;
                display: flex;
                justify-content: center;
                align-items: center;
                background-color: #444;
                border: 1px solid #666;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
                transition: background-color 0.2s;
                color: white;
            }

            .ui-page-tab:hover {
                background-color: #555;
            }

            .ui-page-tab.active {
                background-color: #666;
                border-color: #999;
            }

            .ui-page {
                display: none;
            }

            .ui-page.active {
                display: block;
            }

            .ui-button-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                grid-template-rows: repeat(3, 1fr);
                gap: 5px;
            }

            .ui-grid-button {
                width: 50px;
                height: 50px;
                display: flex;
                justify-content: center;
                align-items: center;
                background-color: #333;
                border: 1px solid #555;
                border-radius: 4px;
                cursor: pointer;
                position: relative;
                transition: background-color 0.2s;
                color: white;
            }

            .ui-grid-button:hover {
                background-color: #444;
            }

            .ui-grid-button:active {
                background-color: #555;
            }

            .ui-hotkey {
                position: absolute;
                top: 2px;
                left: 2px;
                font-size: 12px;
                color: #fff;
                font-weight: bold;
            }

            .ui-logo {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 16px;
                color: #fff;
                font-weight: bold;
            }

            .ui-upgrade-level {
                position: absolute;
                bottom: 2px;
                right: 2px;
                font-size: 12px;
                color: #fff;
                font-weight: bold;
            }

            .ui-tooltip {
                position: absolute;
                background-color: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-size: 14px;
                z-index: 1000;
                pointer-events: none;
                max-width: 200px;
            }

            .upgrade-price {
                color: #4DA6FF; /* Blue color for prices, matching supply color */
                font-weight: bold;
            }
        `;
        document.head.appendChild(style);

        // Create page tabs
        const pageTabs = document.createElement('div');
        pageTabs.id = 'ui-page-tabs';

        for (let i = 1; i <= 6; i++) {
            const tab = document.createElement('div');
            tab.className = 'ui-page-tab' + (i === 1 ? ' active' : '');
            tab.dataset.page = i;
            tab.textContent = i;
            pageTabs.appendChild(tab);
        }

        this.uiContainer.appendChild(pageTabs);

        // Create pages with button grids
        this.createPage(1, [
            { key: 'Q', action: 'action-q' },
            { key: 'W', action: 'action-w' },
            { key: 'E', action: 'action-e' },
            { key: 'R', action: 'action-r' },
            { key: 'T', action: 'action-t' },
            { key: 'A', action: 'action-a' },
            { key: 'S', action: 'action-s' },
            { key: 'D', action: 'action-d' },
            { key: 'F', action: 'action-f' },
            { key: 'G', action: 'action-g' },
            { key: 'Z', action: 'action-z' },
            { key: 'X', action: 'action-x' },
            { key: 'C', action: 'action-c' },
            { key: 'V', action: 'action-v' },
            { key: 'B', action: 'action-b' }
        ]);

        this.createPage(2, [
            { key: 'Q', action: 'action-q-p2' },
            { key: 'W', action: 'action-w-p2' },
            { key: 'E', action: 'action-e-p2' },
            { key: 'R', action: 'action-r-p2' },
            { key: 'T', action: 'action-t-p2' },
            { key: 'A', action: 'action-a-p2' },
            { key: 'S', action: 'action-s-p2' },
            { key: 'D', action: 'action-d-p2' },
            { key: 'F', action: 'action-f-p2' },
            { key: 'G', action: 'action-g-p2' },
            { key: 'Z', action: 'action-z-p2' },
            { key: 'X', action: 'action-x-p2' },
            { key: 'C', action: 'action-c-p2' },
            { key: 'V', action: 'action-v-p2' },
            { key: 'B', action: 'action-b-p2' }
        ]);

        // Create page 3 - Building Menu for Workers
        this.createPage(3, [
            { key: 'Q', action: 'action-q-p3', logo: 'BU', tooltip: 'Bunker: <span class="upgrade-price">50</span>' }, // Build Bunker
            { key: 'W', action: 'action-w-p3', logo: 'SD', tooltip: 'Supply Depot: <span class="upgrade-price">30</span>' }, // Build Supply Depot
            { key: 'E', action: 'action-e-p3', logo: 'ST', tooltip: 'Shield Tower: <span class="upgrade-price">10</span>' }, // Build Shield Tower
            { key: 'R', action: 'action-r-p3', logo: 'SE', tooltip: 'Sensor Tower: <span class="upgrade-price">10</span>' }, // Build Sensor Tower
            { key: 'T', action: 'action-t-p3' },
            { key: 'A', action: 'action-a-p3' },
            { key: 'S', action: 'action-s-p3' },
            { key: 'D', action: 'action-d-p3' },
            { key: 'F', action: 'action-f-p3' },
            { key: 'G', action: 'action-g-p3' },
            { key: 'Z', action: 'action-z-p3' },
            { key: 'X', action: 'action-x-p3' },
            { key: 'C', action: 'action-c-p3' },
            { key: 'V', action: 'action-v-p3' },
            { key: 'B', action: 'action-b-p3' }
        ]);

        // Create page 4 - Unit Upgrades Menu
        this.createPage(4, [
            { key: 'Q', action: 'action-q-p4', logo: 'AR', tooltip: 'Armor: <span class="upgrade-price">25</span>' }, // Armor
            { key: 'W', action: 'action-w-p4', logo: 'AD', tooltip: 'Attack Damage: <span class="upgrade-price">25</span>' }, // Attack Damage
            { key: 'E', action: 'action-e-p4', logo: 'WR', tooltip: 'Weapon Range: <span class="upgrade-price">25</span>' }, // Weapon Range
            { key: 'R', action: 'action-r-p4', logo: 'HR', tooltip: 'Health Regen: <span class="upgrade-price">25</span>' }, // Health Regen
            { key: 'T', action: 'action-t-p4', logo: 'MS', tooltip: 'Movement Speed: <span class="upgrade-price">25</span>' }, // Movement Speed
            { key: 'A', action: 'action-a-p4' },
            { key: 'S', action: 'action-s-p4' },
            { key: 'D', action: 'action-d-p4' },
            { key: 'F', action: 'action-f-p4' },
            { key: 'G', action: 'action-g-p4' },
            { key: 'Z', action: 'action-z-p4' },
            { key: 'X', action: 'action-x-p4' },
            { key: 'C', action: 'action-c-p4' },
            { key: 'V', action: 'action-v-p4' },
            { key: 'B', action: 'action-b-p4' }
        ]);

        // Add to document
        document.body.appendChild(this.uiContainer);

        // Store references to elements
        this.pageTabs = document.querySelectorAll('.ui-page-tab');
        this.uiPages = document.querySelectorAll('.ui-page');
        this.gridButtons = document.querySelectorAll('.ui-grid-button');
    }

    createPage(pageNumber, buttons) {
        const page = document.createElement('div');
        page.className = 'ui-page' + (pageNumber === 1 ? ' active' : '');
        page.dataset.page = pageNumber;

        const grid = document.createElement('div');
        grid.className = 'ui-button-grid';

        buttons.forEach(button => {
            const buttonElement = document.createElement('div');
            buttonElement.className = 'ui-grid-button';
            buttonElement.dataset.action = button.action;

            // Add tooltip if provided
            if (button.tooltip) {
                buttonElement.title = button.tooltip;
                buttonElement.dataset.tooltip = button.tooltip;

                // Use custom tooltip handling for HTML content
                buttonElement.addEventListener('mouseenter', (e) => {
                    const tooltip = document.createElement('div');
                    tooltip.className = 'ui-tooltip';
                    // Use the current dataset tooltip value instead of the initial value
                    tooltip.innerHTML = buttonElement.dataset.tooltip || button.tooltip;
                    document.body.appendChild(tooltip);

                    // Position the tooltip after it's been added to the DOM
                    setTimeout(() => {
                        const rect = buttonElement.getBoundingClientRect();
                        const tooltipRect = tooltip.getBoundingClientRect();

                        // Center horizontally
                        tooltip.style.left = (rect.left + rect.width/2 - tooltipRect.width/2) + 'px';
                        // Position above the button
                        tooltip.style.top = (rect.top - tooltipRect.height - 5) + 'px';
                    }, 0);

                    buttonElement.dataset.tooltipElement = tooltip;
                });

                buttonElement.addEventListener('mouseleave', (e) => {
                    const tooltip = document.querySelector('.ui-tooltip');
                    if (tooltip) {
                        tooltip.remove();
                    }
                });
            }

            // Add hotkey in top-left
            const hotkey = document.createElement('span');
            hotkey.className = 'ui-hotkey';
            hotkey.textContent = button.key;
            buttonElement.appendChild(hotkey);

            // Add logo in center if provided
            if (button.logo) {
                const logo = document.createElement('span');
                logo.className = 'ui-logo';
                logo.textContent = button.logo;
                buttonElement.appendChild(logo);
            }

            // Add upgrade level indicator in bottom-right if it's an upgrade button
            if (button.action && button.action.includes('p4')) {
                const level = document.createElement('span');
                level.className = 'ui-upgrade-level';
                level.textContent = '0';
                level.dataset.level = '0';
                buttonElement.appendChild(level);
            }

            grid.appendChild(buttonElement);
        });

        page.appendChild(grid);
        this.uiContainer.appendChild(page);
    }

    setupEventListeners() {
        // Tab click events
        document.addEventListener('click', (event) => {
            if (event.target.classList.contains('ui-page-tab')) {
                this.switchToPage(parseInt(event.target.dataset.page));
            }
        });

        // Button click events
        document.addEventListener('click', (event) => {
            const button = event.target.closest('.ui-grid-button');
            if (button) {
                this.handleButtonClick(button.dataset.action);
            }
        });

        // Keyboard events
        document.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase();

            // Page switching with number keys 1-6
            if (key >= '1' && key <= '6') {
                this.switchToPage(parseInt(key));
                return;
            }

            // Grid button hotkeys
            const validKeys = ['q', 'w', 'e', 'r', 't', 'a', 's', 'd', 'f', 'g', 'z', 'x', 'c', 'v', 'b'];
            if (validKeys.includes(key)) {
                // Find the button on the current page with this hotkey
                const currentPageElement = document.querySelector(`.ui-page[data-page="${this.currentPage}"]`);
                if (!currentPageElement) return;

                const buttons = currentPageElement.querySelectorAll('.ui-grid-button');
                let actionToTrigger = null;

                for (const button of buttons) {
                    const hotkeyElement = button.querySelector('.ui-hotkey');
                    if (hotkeyElement && hotkeyElement.textContent.toLowerCase() === key) {
                        actionToTrigger = button.dataset.action;

                        // Visual feedback
                        button.style.backgroundColor = '#555';
                        setTimeout(() => {
                            button.style.backgroundColor = '';
                        }, 100);

                        break;
                    }
                }

                if (actionToTrigger) {
                    this.handleButtonClick(actionToTrigger);
                }
            }
        });
    }

    // Show UI (kept for API compatibility)
    show() {
        this.isUIVisible = true;
        this.uiContainer.classList.remove('hidden');
    }

    // Switch to a specific page
    switchToPage(pageNumber) {
        this.currentPage = pageNumber;

        // Update tab highlighting
        this.pageTabs.forEach(tab => {
            tab.classList.toggle('active', parseInt(tab.dataset.page) === pageNumber);
        });

        // Show the selected page, hide others
        this.uiPages.forEach(page => {
            page.classList.toggle('active', parseInt(page.dataset.page) === pageNumber);
        });
    }

    // Handle button clicks
    handleButtonClick(action) {
        if (this.actionHandlers[action]) {
            this.actionHandlers[action]();
        } else {
            console.log(`No handler defined for action: ${action}`);
        }
    }

    // Set a custom action handler
    setActionHandler(action, handler) {
        this.actionHandlers[action] = handler;
    }
}

// Make the class globally available
window.UISystem = UISystem;
