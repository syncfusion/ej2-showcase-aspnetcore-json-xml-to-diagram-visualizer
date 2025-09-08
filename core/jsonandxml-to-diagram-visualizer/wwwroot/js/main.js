// JSON and XML to Diagram Visualizer - Main Application Logic

// Global variables
let jsonXmlDiagram;
let monacoEditor;
let currentEditorInputType = "JSON";
let currentOrientationIndex = 0;
let currentOrientation = "LeftToRight";
let isGraphCollapsed = false;
let showExpandCollapseIcon = true;
let showChildItemsCount = true;
let globalSearchEnterKeyHandler = null;
let spinnerTimeout = null;
const activeViewOptionsSet = new Set(['view-grid', 'view-count', 'expand-collapse']);
let currentSelectedTheme = 'light';
let jsonToXmlConversionUrl = '';
let xmlToJsonConversionUrl = '';

const orientations = ["LeftToRight", "TopToBottom", "RightToLeft", "BottomToTop"];

// Theme settings - Make globally accessible
var currentThemeSettings = {
    theme: 'light',
    themeUrl: "https://cdn.syncfusion.com/ej2/29.1.33/tailwind.css",
    diagramBackgroundColor: "#F8F9FA",
    gridlinesColor: "#EBE8E8",
    nodeFillColor: "rgb(255, 255, 255)",
    nodeStrokeColor: "rgb(188, 190, 192)",
    textKeyColor: "#A020F0",
    textValueColor: "rgb(83, 83, 83)",
    textValueNullColor: "rgb(41, 41, 41)",
    expandIconFillColor: "#e0dede",
    expandIconColor: "rgb(46, 51, 56)",
    expandIconBorder: "rgb(188, 190, 192)",
    connectorStrokeColor: "rgb(188, 190, 192)",
    childCountColor: "rgb(41, 41, 41)",
    booleanColor: "rgb(74, 145, 67)",
    numericColor: "rgb(182, 60, 30)",
    popupKeyColor: "#5C940D",
    popupValueColor: "#1864AB",
    popupContentBGColor: "#F8F9FA",
    highlightFillColor: "rgba(27, 255, 0, 0.1)",
    highlightFocusColor: "rgba(252, 255, 166, 0.57)",
    highlightStrokeColor: "rgb(0, 135, 54)"
};

// Make it globally accessible
window.currentThemeSettings = currentThemeSettings;

function initializeSpinner() {
    ej.base.enableRipple(true);
    ej.popups.createSpinner({
        target: document.getElementById('spinner-container'),
    });
}

// Initialize the application
function initializeJsonXmlVisualizer() {
    const apiEndpoints = document.getElementById('api-endpoints');
    jsonToXmlConversionUrl = apiEndpoints.getAttribute('data-json-to-xml-url');
    xmlToJsonConversionUrl = apiEndpoints.getAttribute('data-xml-to-json-url');

    getDiagramInstance();
    initializeMonacoEditor();
    initializeResizer();
    initializeSpinner();
    initializeNodeDetailsDialog();
    initializeSearchBox();
}

// Initialize the diagram component
function getDiagramInstance() {
    jsonXmlDiagram = document.getElementById("diagram").ej2_instances[0];
    jsonXmlDiagram.tool = ej.diagrams.DiagramTools.ZoomPan | ej.diagrams.DiagramTools.SingleSelect;
}

// Initialize Monaco Editor
function initializeMonacoEditor() {
    require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.34.1/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
            value: '{\n  "loading": "sample data..."\n}',
            language: 'json',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            minimap: { enabled: false },
            theme: 'vs',
            scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 }
        });

        // Handle content changes
        monacoEditor.onDidChangeModelContent(handleEditorContentChange);
        updateEditorStatus(true);

        loadSampleData();
    });
}

// Load sample data
function loadSampleData() {
    fetch('./assets/sample.json')
        .then(response => response.json())
        .then(data => {
            if (monacoEditor) {
                monacoEditor.setValue(JSON.stringify(data, null, 2));
            }
        })
        .catch(error => {
            console.error('Error loading sample data:', error);
            if (monacoEditor) {
                monacoEditor.setValue('{\n  "key": "value"\n}');
            }
        });
}

// Handle editor content changes
async function handleEditorContentChange() {
    const editorContent = monacoEditor.getValue();
    if (editorContent.trim() === "") {
        updateEditorStatus(true);
        return;
    }
    showSpinner();
    try {
        // First validate the content
        const isValid = validateContent(editorContent, currentEditorInputType);
                
        if (!isValid) {
            updateEditorStatus(false);
            showSpinner(); // Keep spinner visible for invalid content
            return;
        }

        // Process the content for diagram generation
        const diagramData = await processEditorContentForDiagram(editorContent);
        
        if (diagramData && (diagramData.nodes.length > 0 || diagramData.connectors.length > 0)) {
            loadDiagramLayout(diagramData.nodes, diagramData.connectors);
            updateEditorStatus(true);
            hideSpinner();
        } else {
            updateEditorStatus(false);
            showSpinner();
        }
    } catch (error) {
        console.error("Content processing error:", error);
        updateEditorStatus(false);
        showSpinner();
    }
    isGraphCollapsed = false;
    updateCollapseMenuText();
}

// Load diagram with nodes and connectors
function loadDiagramLayout(diagramNodes, diagramConnectors) {
    setTimeout(() => {
        try {
            jsonXmlDiagram.nodes = diagramNodes;
            jsonXmlDiagram.connectors = diagramConnectors;
            jsonXmlDiagram.refresh();
            jsonXmlDiagram.fitToPage({
                canZoomIn: true
            });
            updateNodeCount();
            clearSearchInput();
        } catch (error) {
            console.error("Error loading diagram layout:", error);
        }
    });
}


function handleEditorTypeChange(args) {
    const newEditorType = args.value.toUpperCase();
    currentEditorInputType = newEditorType;
    updateNavTitle();

    if (monacoEditor) {
        const currentContent = monacoEditor.getValue();

        // Set the language first
        monaco.editor.setModelLanguage(monacoEditor.getModel(), args.value);

        if (currentContent.trim() === "") {
            return; // No content to convert
        }

        // Use server-side conversion for better accuracy
        convertContentOnServer(currentContent, newEditorType)
            .then(convertedContent => {
                setTimeout(() => {
                    monacoEditor.setValue(convertedContent);
                }, 0);
            })
            .catch(error => {
                console.error("Conversion error:", error);
                updateEditorStatus(false);
            });
    }
    isGraphCollapsed = false;
    updateCollapseMenuText();
}

// Server-side conversion function
async function convertContentOnServer(content, targetType) {
    try {
        let endpoint = '';

        if (targetType === "XML" && content.trim().startsWith('{')) {
            // Convert JSON to XML
            endpoint = jsonToXmlConversionUrl;
        } else if (targetType === "JSON" && content.trim().startsWith('<')) {
            // Convert XML to JSON
            endpoint = xmlToJsonConversionUrl;
        } else {
            // No conversion needed
            return content;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: content })
        });

        const result = await response.json();

        if (result.success) {
            return result.content;
        } else {
            console.error('Conversion failed');
        }
    } catch (error) {
        console.error('Server conversion error:', error);
    }
}

// Converts the json and xml content to diagram data (nodes and connectors)
async function processEditorContentForDiagram(editorContent) {
    try {
        let diagramData;
        let jsonContent;

        if (currentEditorInputType.toLowerCase() === "xml") {
            // Convert XML to JSON using server-side conversion 
            const response = await fetch(xmlToJsonConversionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: editorContent })
            });

            const result = await response.json();
            if (result.success) {
                jsonContent = result.content;
                // Parse the JSON content for diagram processing
                const parsedJson = JSON.parse(jsonContent);
                diagramData = JsonDiagramParser.processData(parsedJson);
            } else {
                console.error('XML to JSON conversion failed');
            }
        } else {
            // Process JSON directly
            const parsed = JSON.parse(editorContent);
            diagramData = JsonDiagramParser.processData(parsed);
        }

        return diagramData;
    } catch (error) {
        console.error("Diagram processing error:", error);
    }
}

// Json and Xml Data validation
function validateContent(content, type) {
    try {
        if (!content || content.trim() === '') {
            return false;
        }

        if (type.toLowerCase() === 'xml') {
            // Validate XML locally
            return isValidXML(content);
        } else if (type.toLowerCase() === 'json') {
            // Validate JSON locally
            return isValidJSON(content);
        } else {
            return false;
        }
    } catch (error) {
        console.error('Local validation error:', error);
        return false;
    }
}

// Helper function to validate JSON
function isValidJSON(content) {
    try {
        JSON.parse(content);
        return true;
    } catch {
        return false;
    }
}

// Helper function to validate XML
function isValidXML(content) {
    try {
        // Trim whitespace and check if content exists
        const trimmedContent = content.trim();
        if (!trimmedContent) {
            return false;
        }

        // Check basic XML structure
        if (!trimmedContent.startsWith('<') || !trimmedContent.endsWith('>')) {
            return false;
        }

        // Wrap with root element to handle multiple root elements
        const wrappedXml = `<root>${trimmedContent}</root>`;

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(wrappedXml, "text/xml");

        // Check for parser errors
        const parserError = xmlDoc.getElementsByTagName("parsererror");
        if (parserError.length > 0) {
            return false;
        }

        // Check if document has a root element
        if (!xmlDoc.documentElement || xmlDoc.documentElement.nodeName === "parsererror") {
            return false;
        }

        return true;
    } catch (error) {
        console.error('XML validation error:', error);
        return false;
    }
}

// Event Handlers
function handleFileMenuClick(args) {
    switch (args.item.id) {
        case 'import':
            importFile();
            break;
        case 'export':
            exportFile();
            break;
    }
}

function handleExpandStateChange (args) {
    const node = args.element;

    if (!node || typeof node !== 'object') {
        return;
    }

    // Check if it's a root node (no incoming edges)
    const isRootNode = !node.inEdges || node.inEdges.length === 0;

    if (isRootNode) {
        isGraphCollapsed = !node.isExpanded;
        updateCollapseMenuText();
    }
};

function handleViewMenuClick(args) {
    // Get the dropdown button instance
    const viewMenuButton = document.getElementById('viewMenuButton').ej2_instances[0];
    
    // Toggle the icon
    const updatedIconClass = toggleMenuItemIconClass(activeViewOptionsSet, args.item);
    args.item.iconCss = updatedIconClass;
    
    // Update the dropdown items
    viewMenuButton.setProperties({items: viewMenuButton.items}, true);
    
    // Execute the original functionality
    switch (args.item.id) {
        case 'view-grid':
            toggleGrid();
            break;
        case 'view-count':
            showChildItemsCount = !showChildItemsCount;
            jsonXmlDiagram.fitToPage({ mode: "Page", region: "Content", canZoomIn: true });
            jsonXmlDiagram.refresh();
            break;
        case 'expand-collapse':
            showExpandCollapseIcon = !showExpandCollapseIcon;
            jsonXmlDiagram.refresh();
            jsonXmlDiagram.fitToPage({ mode: "Page", region: "Content", canZoomIn: true });
            break;
    }
}

function handleThemeMenuClick(args) {
    const selectedTheme = args.item.id;
    const isDarkThemeSelected = args.item.text === 'Dark';
    currentSelectedTheme = isDarkThemeSelected ? 'Dark' : 'Light';
    
    // Get the dropdown button instance
    const themeMenuButton = document.getElementById('themeMenuButton').ej2_instances[0];
    
    // Update the theme selection icons
    themeMenuButton.setProperties({items: themeMenuButton.items.map(themeItem => ({
        ...themeItem,
        iconCss: themeItem.id === selectedTheme ? 'e-icons e-check' : ''
    }))}, true);
    
    // Apply theme changes
    document.body.classList.toggle('dark', isDarkThemeSelected);
    setTheme(selectedTheme);
    updateNavTitle();
}

function toggleMenuItemIconClass(activeItemsSet, selectedMenuItem) {
    if (activeItemsSet.has(selectedMenuItem.id)) {
        activeItemsSet.delete(selectedMenuItem.id);
        return '';
    } else {
        activeItemsSet.add(selectedMenuItem.id);
        return 'e-icons e-check';
    }
}

function handleToolbarClick(args) {
    switch (args.item.id) {
        case 'reset':
            jsonXmlDiagram.reset();
            break;
        case 'fitToPage':
            jsonXmlDiagram.reset();
            jsonXmlDiagram.fitToPage({ mode: "Page", region: "Content", canZoomIn: true });
            break;
        case 'zoomIn':
            jsonXmlDiagram.zoomTo({ type: "ZoomIn", zoomFactor: 0.2 });
            break;
        case 'zoomOut':
            jsonXmlDiagram.zoomTo({ type: "ZoomOut", zoomFactor: 0.2 });
            break;
    }
}

function handleHamburgerMenuClick(args) {
    switch (args.item.id) {
        case 'exportImage':
            showExportDialog();
            break;
        case 'rotateLayout':
            rotateLayout();
            break;
        case 'collapseGraph':
            toggleCollapseGraph();
            break;
    }
}

function handleSearchInput(args) {
    const searchQuery = args.value.trim().toLowerCase();
    searchNodes(searchQuery);
}

function handleDiagramClick(clickEventArgs) {
    if (
        clickEventArgs?.element instanceof ej.diagrams.Node &&
        clickEventArgs.element.data &&
        clickEventArgs.actualObject !== undefined
    ) {
        const nodeData = clickEventArgs.element.data.actualdata;
        const nodePath = clickEventArgs.element.data.path;

        if (nodeData && nodePath) {
            showNodeDetails(nodeData, nodePath);
        }
    }
}

// Utility Functions

// Show Spinner with delay and timeout management
function showSpinner() {
    // Clear any existing timeout
    if (spinnerTimeout) {
        clearTimeout(spinnerTimeout);
    }

    spinnerTimeout = setTimeout(() => {
        ej.popups.showSpinner(document.getElementById('spinner-container'));
        spinnerTimeout = null; // Reset timeout reference
    }, 100);
}

// Hide Spinner and cancel pending show
function hideSpinner() {
    // Cancel pending spinner show
    if (spinnerTimeout) {
        clearTimeout(spinnerTimeout);
        spinnerTimeout = null;
    }

    // Hide spinner if it's currently showing
    ej.popups.hideSpinner(document.getElementById('spinner-container'));
}

function updateEditorStatus(isValid) {
    const validStatus = document.querySelector('.valid-status');
    const invalidStatus = document.querySelector('.invalid-status');

    if (isValid) {
        validStatus.style.display = 'flex';
        invalidStatus.style.display = 'none';
        validStatus.querySelector('span:nth-child(2)').textContent = `Valid ${currentEditorInputType}`;
    } else {
        validStatus.style.display = 'none';
        invalidStatus.style.display = 'flex';
        invalidStatus.querySelector('span:nth-child(2)').textContent = `InValid ${currentEditorInputType}`;
        invalidStatus.style.color = "red";
    }
}

function updateNodeCount() {
    const nodeCount = jsonXmlDiagram?.nodes?.length || 0;
    document.querySelector('.node-count').textContent = `Nodes: ${nodeCount}`;
}

function updateNavTitle() {
    const titleElement = document.querySelector('.nav-title');
    if (titleElement) {
        titleElement.textContent = `${currentEditorInputType} To Diagram`;
    }
}

function clearSearchInput() {
    const searchInput = document.getElementById('toolbar-search');
    if (searchInput) {
        searchInput.ej2_instances[0].value = '';
    }
    const searchCounter = document.querySelector('.search-counter');
    if (searchCounter) {
        searchCounter.style.display = 'none';
    }
}

// Initialize resizer for split panels
function initializeResizer() {
    const splitter = document.querySelector('.splitter');
    const leftPanel = document.querySelector('.left-panel');
    const rightPanel = document.querySelector('.right-panel');

    let isResizing = false;

    splitter.addEventListener('mousedown', () => {
        isResizing = true;
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
    });

    function handleResize(e) {
        if (!isResizing) return;
        const containerRect = document.querySelector('.main-grid').getBoundingClientRect();
        const newLeftWidth = e.clientX - containerRect.left;
        const minWidth = 200;
        const maxWidth = containerRect.width - 300;

        if (newLeftWidth >= minWidth && newLeftWidth <= maxWidth) {
            leftPanel.style.width = newLeftWidth + 'px';
            rightPanel.style.width = (containerRect.width - newLeftWidth - 5) + 'px';
        }
    }

    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
    }
}

