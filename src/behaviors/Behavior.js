'use strict';

var Point = require('rectangular').Point;

var Base = require('../Base');
var Column = require('./Column');
var cellEventFactory = require('../lib/cellEventFactory');
var featureRegistry = require('../features');
var Synonomous = require('synonomous');
var propClassEnum = require('../defaults.js').propClassEnum;
var assignOrDelete = require('../lib/misc').assignOrDelete;


var noExportProperties = [
    'columnHeader',
    'columnHeaderColumnSelection',
    'filterProperties',
    'rowHeader',
    'rowHeaderRowSelection',
    'rowNumbersProperties',
    'treeColumnProperties',
    'treeColumnPropertiesColumnSelection',
];

/**
 * @constructor
 * @abstract
 * @desc A sort of "model++." It contains all code/data that's necessary for easily implementing a virtual data source and its manipulation/analytics.
 *
 */
var Behavior = Base.extend('Behavior', {

    /**
     * @desc this is the callback for the plugin pattern of nested tags
     * @param {Hypergrid} grid
     * @param {object} [options] - _(See {@link behaviors.JSON#setData} for additional options.)_
     * @param {DataModels[]} [options.subgrids]
     * @memberOf Behavior#
     */
    initialize: function(grid, options) {
        /**
         * @type {Hypergrid}
         * @memberOf Behavior#
         */
        this.grid = grid;

        this.synonomous = new Synonomous;

        this.initializeFeatureChain();

        this.grid.behavior = this;
        this.reset(options);
    },

    /**
     * @desc Create the feature chain - this is the [chain of responsibility](http://c2.com/cgi/wiki?ChainOfResponsibilityPattern) pattern.
     * @param {Hypergrid} [grid] Unnecesary legacy parameter. May be omitted.
     * @memberOf Behavior#
     */
    initializeFeatureChain: function(grid) {
        var constructors;

        /**
         * @summary Controller chain of command.
         * @desc Each feature is linked to the next feature.
         * @type {Feature}
         * @memberOf Behavior#
         */
        this.featureChain = undefined;

        /**
         * @summary Hash of instantiated features by class names.
         * @desc Built here but otherwise not in use.
         * @type {object}
         * @memberOf Behavior#
         */
        this.featureMap = {};

        this.featureRegistry = this.featureRegistry || featureRegistry;

        if (this.grid.properties.features) {
            var getFeatureConstructor = this.featureRegistry.get.bind(this.featureRegistry);
            constructors = this.grid.properties.features.map(getFeatureConstructor);
        } else if (this.features) {
            constructors = this.features;
            warnBehaviorFeaturesDeprecation.call(this);
        }

        constructors.forEach(function(FeatureConstructor, i) {
            var feature = new FeatureConstructor;

            this.featureMap[feature.$$CLASS_NAME] = feature;

            if (i) {
                this.featureChain.setNext(feature);
            } else {
                this.featureChain = feature;
            }
        }, this);

        if (this.featureChain) {
            this.featureChain.initializeOn(this.grid);
        }
    },

    features: [], // override in implementing class; or provide feature names in grid.properties.features; else no features

    /**
     * @param {object} [options]
     * @param {object} [options.pipeline] - Consumed by {@link dataModels.JSON#reset}.
     *
     * If omitted, previously established pipeline is reused.
     * @param {object} [options.controllers] - Consumed by {@link dataModels.JSON#reset}.
     *
     * If omitted, previously established controllers list is reused.
     * @memberOf Behavior#
     */
    reset: function(options) {
        if (this.dataModel) {
            options = options || {};
            this.dataModel.reset({
                pipeline: options.pipeline,
                controllers: options.controllers
            });
        } else {
            /**
             * @type {dataModelAPI}
             * @memberOf Behavior#
             */
            this.dataModel = this.getNewDataModel(options);

            // recreate `CellEvent` class so it can set up its internal `grid`, `behavior`, and `dataModel` convenience properties
            this.CellEvent = cellEventFactory(this.grid);
        }

        this.scrollPositionX = this.scrollPositionY = 0;

        this.rowPropertiesPrototype = Object.create(this.grid.properties,
            require('./rowProperties').rowPropertiesPrototypeDescriptors);

        this.clearColumns();
        this.createColumns();

        /**
         * Ordered list of subgrids to render.
         * @type {subgridSpec[]}
         * @memberOf Hypergrid#
         */
        this.subgrids = options.subgrids || this.subgrids || this.grid.properties.subgrids;
    },

    get renderedColumnCount() {
        return this.grid.renderer.visibleColumns.length;
    },

    get renderedRowCount() {
        return this.grid.renderer.visibleRows.length;
    },

    get leftMostColIndex() {
        return this.grid.properties.showRowNumbers ? this.rowColumnIndex : (this.hasTreeColumn() ? this.treeColumnIndex : 0);
    },

    clearColumns: function() {
        var schema = this.dataModel.schema,
            tc = this.treeColumnIndex,
            rc = this.rowColumnIndex;

        schema[tc] = schema[tc] || {
            name: 'Tree',
            header: 'Tree'
        };

        schema[rc] = schema[rc] || {
            name: '',
            header: ''
        };

        /**
         * @type {Column[]}
         * @memberOf Behavior#
         */
        this.columns = [];

        /**
         * @type {Column[]}
         * @memberOf Behavior#
         */
        this.allColumns = [];

        this.allColumns[tc] = this.columns[tc] = this.newColumn({
            index: tc,
            header: schema[tc].header
        });
        this.allColumns[rc] = this.columns[rc] = this.newColumn({
            index: rc,
            header: schema[rc].header
        });

        this.columns[tc].properties.propClassLayers = this.columns[rc].properties.propClassLayers = [propClassEnum.COLUMNS];

        // Signal the renderer to size the now-reset handle column before next render
        this.grid.renderer.resetRowHeaderColumnWidth();
    },

    getActiveColumn: function(x) {
        return this.columns[x];
    },

    /**
     * The "grid index" of an active column given a "data index" (number), column name (string), or column object
     * @param {Column|number} columnOrIndex
     * @returns {undefined|number} The grid index of the column or undefined if column not in grid.
     * @memberOf Hypergrid#
     */
    getActiveColumnIndex: function(columnOrIndexOrName) {
        var value = columnOrIndexOrName instanceof Column ? columnOrIndexOrName.index : columnOrIndexOrName,
            key = typeof index === 'number' ? 'index' : 'name';

        return this.columns.findIndex(function(column) { return column[key] === value; });
    },

    getVisibleColumn: function() {
        return this.deprecated('getVisibleColumn(x)', 'getActiveColumn(x)', '1.0.6', arguments);
    },
    getVisibleColumnName: function() {
        return this.deprecated('getVisibleColumnName(x)', 'getActiveColumn(x).name', '1.0.6', arguments);
    },
    getColumnId: function() {
        return this.deprecated('getColumnId(x)', 'getActiveColumn(x).header', '1.0.6', arguments);
    },
    getHeader: function() {
        return this.deprecated('getHeader(x)', 'getActiveColumn(x).header', '1.0.6', arguments);
    },

    getColumn: function(x) {
        return this.allColumns[x];
    },

    newColumn: function(options) {
        return new Column(this, options);
    },

    addColumn: function(options) {
        var column = this.newColumn(options),
            columns = this.columns,
            allColumns = this.allColumns;

        columns.push(column);
        this.synonomous.decorateList(columns.length - 1, columns);

        allColumns.push(column);
        this.synonomous.decorateList(allColumns.length - 1, allColumns);

        return column;
    },

    createColumns: function() {
        this.clearColumns();
        //concrete implementation here
    },

    getColumnWidth: function(x) {
        var column = this.getActiveColumn(x);
        return column ? column.getWidth() : 0;
    },

    /**
     * @param {Column|number} columnOrIndex - The column or active column index.
     * @param width
     * @memberOf Hypergrid#
     */
    setColumnWidth: function(columnOrIndex, width) {
        var column = columnOrIndex >= -2 ? this.getActiveColumn(columnOrIndex) : columnOrIndex;
        column.setWidth(width);
        this.stateChanged();
    },

    getCellProvider: function(name) {
        return this.deprecated('getCellProvider()', 'grid.cellRenderers', '1.0.6', arguments);
    },
    createCellProvider: function(name) {
        console.error('getCellProvider() is deprecated as of v1.0.6. No replacement; do not call. Previously called by `Behavior` constructor; `new CellRenderers()` is now called by `Hypergrid` constructor instead.', arguments);
    },

    /**
     * @memberOf Behavior#
     */
    reindex: function() {
        this.dataModel.reindex();
        this.shapeChanged();
    },

    /**
     * @memberOf Behavior#
     * @desc utility function to empty an object of its members
     * @param {object} obj - the object to empty
     * @param {boolean} [exportProps]
     * * `undefined` (omitted) - delete *all* properties
     * * **falsy** - delete *only* the export properties
     * * **truthy** - delete all properties *except* the export properties
     */
    clearObjectProperties: function(obj, exportProps) {
        for (var key in obj) {
            if (
                obj.hasOwnProperty(key) && (
                    exportProps === undefined ||
                    !exportProps && noExportProperties.indexOf(key) >= 0 ||
                    exportProps && noExportProperties.indexOf(key) < 0
                )
            ) {
                delete obj[key];
            }
        }
    },

    /**
     * @memberOf Behavior#
     * @desc getter for a [Memento](http://c2.com/cgi/wiki?MementoPattern) Object
     * @returns {object}
     */
    getPrivateState: function() {
        return this.deprecated('getPrivateState()', 'grid.properties', '1.2.0');
    },

    //this is effectively a clone, with certain things removed....
    getState: function() {
        var copy = JSON.parse(JSON.stringify(this.grid.properties));
        this.clearObjectProperties(copy.columnProperties, false);
        return copy;
    },
    /**
     * @memberOf Behavior#
     * @desc clear all table state
     */
    clearState: function() {
        this.grid.clearState();
        this.createColumns();
    },

    /**
     * @memberOf Behavior#
     * @desc Restore this table to a previous state.
     * See the [memento pattern](http://c2.com/cgi/wiki?MementoPattern).
     * @param {Object} properties - assignable grid properties
     */
    setState: function(properties) {
        this.addState(properties, true);
    },

    /**
     *
     * @param {Object} properties - assignable grid properties
     * @param {boolean} [settingState] - Clear properties object before assignments.
     */
    addState: function(properties, settingState) {
        if (settingState) {
            this.clearState();
        }

        var gridProps = this.grid.properties;

        gridProps.settingState = settingState;
        assignOrDelete(gridProps, properties);
        delete gridProps.settingState;

        this.reindex();
    },

    /**
     * @summary Sets properties for active columns.
     * @desc Sets multiple columns' properties from elements of given array or collection. Keys may be column indexes or column names. The properties collection is cleared first. Falsy elements are ignored.
     * @param {object[]|undefined} columnsHash - If undefined, this call is a no-op.
     */
    setAllColumnProperties: function(columnsHash) {
        this.addAllColumnProperties(columnsHash, true);
    },

    /**
     * @summary Adds properties for multiple columns.
     * @desc Adds . The properties collection is optionally cleared first. Falsy elements are ignored.
     * @param {object[]|undefined} columnsHash - If undefined, this call is a no-op.
     * @param {boolean} [settingState] - Clear columns' properties objects before copying properties.
     */
    addAllColumnProperties: function(columnsHash, settingState) {
        if (!columnsHash) {
            return;
        }

        var columns = this.grid.behavior.getColumns();

        Object.keys(columnsHash).forEach(function(key) {
            var column = columns[key];
            if (column) {
                column.addProperties(columnsHash[key], settingState);
            }
        });
    },

    setColumnOrder: function(columnIndexes) {
        if (Array.isArray(columnIndexes)){
            var columns = this.columns,
                allColumns = this.allColumns;

            // avoid recreating the array to keep refs valid; just empty it (including name dictionary)
            columns.length = 0;
            var tc = this.treeColumnIndex.toString(), rc = this.rowColumnIndex.toString();
            Object.keys(columns).forEach(function(key) {
                switch (key) {
                    case tc:
                    case rc:
                        break;
                    default:
                        delete columns[key];
                }
            });

            columnIndexes.forEach(function(index) {
                columns.push(allColumns[index]);
            });

            this.synonomous.decorateList(columns);
        }
    },

    setColumnOrderByName: function(columnNames) {
        if (Array.isArray(columnNames)) {
            var allColumns = this.allColumns;
            this.setColumnOrder(columnNames.map(function(name) { return allColumns[name].index; }));
        }
    },

    _setColumnOrder: function(columnIndexes) {
        this.deprecated('_setColumnOrder(columnIndexes)', 'setColumnOrder(columnIndexes)', '1.2.10', arguments);
    },

    /**
     * @memberOf Behavior#
     * @desc Rebuild the column order indexes
     * @param {Array} columnIndexes - list of column indexes
     * @param {Boolean} [silent=false] - whether to trigger column changed event
     */
    setColumnIndexes: function(columnIndexes, silent) {
        this.grid.properties.columnIndexes = columnIndexes;
        if (!silent) {
            this.grid.fireSyntheticOnColumnsChangedEvent();
        }
    },

    /**
     * @summary Show inactive column(s) or move active column(s).
     *
     * @desc Adds one or several columns to the "active" column list.
     *
     * @param {boolean} [isActiveColumnIndexes=false] - Which list `columnIndexes` refers to:
     * * `true` - The active column list. This can only move columns around within the active column list; it cannot add inactive columns (because it can only refer to columns in the active column list).
     * * `false` - The full column list (as per column schema array). This inserts columns from the "inactive" column list, moving columns that are already active.
     *
     * @param {number|number[]} columnIndexes - Column index(es) into list as determined by `isActiveColumnIndexes`. One of:
     * * **Scalar column index** - Adds single column at insertion point.
     * * **Array of column indexes** - Adds multiple consecutive columns at insertion point.
     *
     * _This required parameter is promoted left one arg position when `isActiveColumnIndexes` omitted._
     *
     * @param {number} [referenceIndex=this.columns.length] - Insertion point, _i.e.,_ the element to insert before. A negative values skips the reinsert. Default is to insert new columns at end of active column list.
     *
     * _Promoted left one arg position when `isActiveColumnIndexes` omitted._
     *
     * @param {boolean} [allowDuplicateColumns=false] - Unless true, already visible columns are removed first.
     *
     * _Promoted left one arg position when `isActiveColumnIndexes` omitted + one position when `referenceIndex` omitted._
     *
     * @memberOf Behavior#
     */
    showColumns: function(isActiveColumnIndexes, columnIndexes, referenceIndex, allowDuplicateColumns) {
        // Promote args when isActiveColumnIndexes omitted
        if (typeof isActiveColumnIndexes === 'number' || Array.isArray(isActiveColumnIndexes)) {
            allowDuplicateColumns = referenceIndex;
            referenceIndex = columnIndexes;
            columnIndexes = isActiveColumnIndexes;
            isActiveColumnIndexes = false;
        }

        var activeColumns = this.columns,
            sourceColumnList = isActiveColumnIndexes ? activeColumns : this.allColumns;

        // Nest scalar index
        if (typeof columnIndexes === 'number') {
            columnIndexes = [columnIndexes];
        }

        var newColumns = columnIndexes
            // Look up columns using provided indexes
            .map(function(index) { return sourceColumnList[index]; })
            // Remove any undefined columns
            .filter(function(column) { return column; });

        // Default insertion point is end (i.e., before (last+1)th element)
        if (typeof referenceIndex !== 'number') {
            allowDuplicateColumns = referenceIndex; // assume reference index was omitted when not a number
            referenceIndex = activeColumns.length;
        }

        // Remove already visible columns and adjust insertion point
        if (!allowDuplicateColumns) {
            newColumns.forEach(function(column) {
                var i = activeColumns.indexOf(column);
                if (i >= 0) {
                    activeColumns.splice(i, 1);
                    if (referenceIndex > i) {
                        --referenceIndex;
                    }
                }
            });
        }

        // Insert the new columns at the insertion point
        if (referenceIndex >= 0) {
            activeColumns.splice.apply(activeColumns, [referenceIndex, 0].concat(newColumns));
        }

        this.grid.properties.columnIndexes = activeColumns.map(function(column) { return column.index; });
    },

    /**
     * @summary Hide active column(s).
     * @desc Removes one or several columns from the "active" column list.
     * @param {boolean} [isActiveColumnIndexes=false] - Which list `columnIndexes` refers to:
     * * `true` - The active column list.
     * * `false` - The full column list (as per column schema array).
     * @param {number|number[]} columnIndexes - Column index(es) into list as determined by `isActiveColumnIndexes`. One of:
     * * **Scalar column index** - Adds single column at insertion point.
     * * **Array of column indexes** - Adds multiple consecutive columns at insertion point.
     *
     * _This required parameter is promoted left one arg position when `isActiveColumnIndexes` omitted._
     * @memberOf Behavior#
     */
    hideColumns: function(isActiveColumnIndexes, columnIndexes) {
        var args = Array.prototype.slice.call(arguments); // Convert to array so we can add an argument (element)
        args.push(-1); // Remove only; do not reinsert.
        this.showColumns.apply(this, args);
    },

    /**
     * @memberOf Behavior#
     * @desc fetch the value for a property key
     * @returns {*} The value of the given property.
     * @param {string} key - a property name
     */
    resolveProperty: function(key) {
        // todo: remove when we remove the deprecated grid.resolveProperty
        return this.grid.resolveProperty(key);
    },

    /**
     * @memberOf Behavior#
     * @desc A specific cell was clicked; you've been notified.
     * @param {Object} event - all event information
     * @return {boolean} Clicked in a drill-down column.
     */
    cellClicked: function(event) {
        if (arguments.length === 2) {
            return this.deprecated('cellClicked(cell, event)', 'cellClicked(event)', '1.2.0', arguments);
        }
        return this.dataModel.cellClicked(event);
    },

    /**
     * @memberOf Behavior#
     * @desc A specific cell was le double-clicked; you've been notified.
     * @param {Point} cell - point of cell coordinates
     * @param {Object} event - all event information
     */
    cellDoubleClicked: function(cell, event) {

    },

    lookupFeature: function(key) {
        return this.featureMap[key];
    },

    /**
     * @param {CellEvent|number} xOrCellEvent - Grid column coordinate.
     * @param {number} [y] - Grid row coordinate. Omit if `xOrCellEvent` is a CellEvent.
     * @param {dataModelAPI} [dataModel] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid. If given, x and y are interpreted as data cell coordinates (unadjusted for scrolling). Does not default to the data subgrid, although you can provide it explicitly (`this.subgrids.lookup.data`).
     * @memberOf Behavior#
     */
    getValue: function(xOrCellEvent, y, dataModel) {
        if (typeof xOrCellEvent !== 'object') {
            var x = xOrCellEvent;
            xOrCellEvent = new this.CellEvent;
            if (dataModel) {
                xOrCellEvent.resetDataXY(x, y, dataModel);
            } else {
                xOrCellEvent.resetGridCY(x, y);
            }
        }
        return xOrCellEvent.value;
    },

    /**
     * @summary Gets the number of rows in the data subgrid.
     * @memberOf Behavior.prototype
     */
    getRowCount: function() {
        return this.dataModel.getRowCount();
    },

    getUnfilteredValue: function(x, y) {
        return this.deprecated('getUnfilteredValue()', '', '1.4.0', arguments, 'No longer supported');
    },

    /**
     * @memberOf Behavior#
     * @desc update the data at point x, y with value
     * @return The data.
     * @param {CellEvent|number} xOrCellEvent - Grid column coordinate.
     * @param {number} [y] - Grid row coordinate. Omit if `xOrCellEvent` is a CellEvent.
     * @param {Object} value - The value to use. _When `y` omitted, promoted to 2nd arg._
     * @param {dataModelAPI} [dataModel] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid. If given, x and y are interpreted as data cell coordinates (unadjusted for scrolling). Does not default to the data subgrid, although you can provide it explicitly (`this.subgrids.lookup.data`).
     * @return {boolean} Consumed.
     */
    setValue: function(xOrCellEvent, y, value, dataModel) {
        if (typeof xOrCellEvent === 'object') {
            value = y;
        } else {
            var x = xOrCellEvent;
            xOrCellEvent = new this.CellEvent;
            if (dataModel) {
                xOrCellEvent.resetDataXY(x, y, dataModel);
            } else {
                xOrCellEvent.resetGridCY(x, y);
            }
        }
        xOrCellEvent.value = value;
    },

    getDataValue: function(x, y) {
        return this.deprecated('getDataValue(x, y)', 'dataModel.getValue(x, y)', '1.1.0', arguments);
    },

    setDataValue: function(x, y, value) {
        return this.deprecated('setDataValue(x, y, value)', 'dataModel.setValue(x, y, value)', '1.1.0', arguments);
    },

    /**
     * @summary Get the cell's own properties object.
     * @desc May be undefined because cells only have their own properties object when at lest one own property has been set.
     * @param {CellEvent|number} xOrCellEvent - Data x coordinate.
     * @param {number} [y] - Grid row coordinate. _Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     * @returns {undefined|object} The "own" properties of the cell at x,y in the grid. If the cell does not own a properties object, returns `undefined`.
     * @memberOf Behavior#
     */
    getCellOwnProperties: function(xOrCellEvent, y, dataModel) {
        switch (arguments.length) {
            case 1: // xOrCellEvent is cellEvent
                return xOrCellEvent.column.getCellOwnProperties(xOrCellEvent.dataCell.y, xOrCellEvent.subgrid);
            case 2: case 3: // xOrCellEvent is x
                return this.getColumn(xOrCellEvent).getCellOwnProperties(y, dataModel);
        }
    },

    /**
     * @summary Get the properties object for cell.
     * @desc This is the cell's own properties object if found else the column object.
     *
     * If you are seeking a single specific property, consider calling {@link Behavior#getCellProperty} instead.
     * @param {CellEvent|number} xOrCellEvent - Data x coordinate.
     * @param {number} [y] - Grid row coordinate. _Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     * @return {object} The properties of the cell at x,y in the grid.
     * @memberOf Behavior#
     */
    getCellProperties: function(xOrCellEvent, y, dataModel) {
        switch (arguments.length) {
            case 1: // xOrCellEvent is cellEvent
                return xOrCellEvent.properties;
            case 2: case 3: // xOrCellEvent is x
                return this.getColumn(xOrCellEvent).getCellProperties(y, dataModel);
        }
    },

    /**
     * @summary Return a specific cell property.
     * @desc If there is no cell properties object, defers to column properties object.
     * @param {CellEvent|number} xOrCellEvent - Data x coordinate.
     * @param {number} [y] - Grid row coordinate._ Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {string} key - Name of property to get. _When `y` omitted, this param promoted to 2nd arg._
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     * @return {object} The specified property for the cell at x,y in the grid.
     * @memberOf Behavior#
     */
    getCellProperty: function(xOrCellEvent, y, key, dataModel) {
        if (typeof xOrCellEvent === 'object') {
            key = y;
            return xOrCellEvent.properties[key];
        } else {
            return this.getColumn(xOrCellEvent).getCellProperty(y, key, dataModel);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc update the data at point x, y with value
     * @param {CellEvent|number} xOrCellEvent - Data x coordinate.
     * @param {number} [y] - Grid row coordinate. _Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {Object} properties - Hash of cell properties. _When `y` omitted, this param promoted to 2nd arg._
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     */
    setCellProperties: function(xOrCellEvent, y, properties, dataModel) {
        if (typeof xOrCellEvent === 'object') {
            properties = y;
            return xOrCellEvent.column.setCellProperties(xOrCellEvent.dataCell.y, properties, xOrCellEvent.subgrid);
        } else {
            return this.getColumn(xOrCellEvent).setCellProperties(y, properties, dataModel);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc update the data at point x, y with value
     * @param {CellEvent|number} xOrCellEvent - Data x coordinate.
     * @param {number} [y] - Grid row coordinate. _Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {Object} properties - Hash of cell properties. _When `y` omitted, this param promoted to 2nd arg._
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     */
    addCellProperties: function(xOrCellEvent, y, properties, dataModel) {
        if (typeof xOrCellEvent === 'object') {
            properties = y;
            return xOrCellEvent.column.addCellProperties(xOrCellEvent.dataCell.y, properties, xOrCellEvent.subgrid); // y omitted so y here is actually properties
        } else {
            return this.getColumn(xOrCellEvent).addCellProperties(y, properties, dataModel);
        }
    },

    /**
     * @summary Set a specific cell property.
     * @desc If there is no cell properties object, defers to column properties object.
     *
     * NOTE: For performance reasons, renderer's cell event objects cache their respective cell properties objects. This method accepts a `CellEvent` overload. Whenever possible, use the `CellEvent` from the renderer's cell event pool. Doing so will reset the cell properties object cache.
     *
     * If you use some other `CellEvent`, the renderer's `CellEvent` properties cache will not be automatically reset until the whole cell event pool is reset on the next call to {@link Renderer#computeCellBoundaries}. If necessary, you can "manually" reset it by calling {@link Renderer#resetCellPropertiesCache|resetCellPropertiesCache(yourCellEvent)} which searches the cell event pool for one with matching coordinates and resets the cache.
     *
     * The raw coordinates overload calls the `resetCellPropertiesCache(x, y)` overload for you.
     * @param {CellEvent|number} xOrCellEvent - `CellEvent` or data x coordinate.
     * @param {number} [y] - Grid row coordinate. _Omit when `xOrCellEvent` is a `CellEvent`._
     * @param {string} key - Name of property to get. _When `y` omitted, this param promoted to 2nd arg._
     * @param value
     * @param {dataModelAPI} [dataModel=this.subgrids.lookup.data] - For use only when `xOrCellEvent` is _not_ a `CellEvent`: Provide a subgrid.
     * @memberOf Behavior#
     */
    setCellProperty: function(xOrCellEvent, y, key, value, dataModel) {
        var cellOwnProperties;
        if (typeof xOrCellEvent === 'object') {
            value = key;
            key = y;
            cellOwnProperties = xOrCellEvent.setCellProperty(key, value);
        } else {
            cellOwnProperties = this.getColumn(xOrCellEvent).setCellProperty(y, key, value, dataModel);
            this.grid.renderer.resetCellPropertiesCache(xOrCellEvent, y, dataModel);
        }
        return cellOwnProperties;
    },

    getUnfilteredRowCount: function() {
        return this.deprecated('getUnfilteredRowCount()', '', '1.2.0', arguments, 'No longer supported');
    },

    /**
     * @memberOf Behavior#
     * @desc The value is lazily initialized and comes from the properties mechanism for '`defaultRowHeight`', which should be ~20px.
     * @returns {number} The row height in pixels.
     */
    getDefaultRowHeight: function() {
        return this.deprecated('getDefaultRowHeight()', 'grid.properties.defaultRowHeight', '1.2.0');
    },

    /**
     * @memberOf Behavior#
     * @return {number} The width of the fixed column area in the hypergrid.
     */
    getFixedColumnsWidth: function() {
        var count = this.getFixedColumnCount(),
            columnWidth,
            total = 0,
            i = this.leftMostColIndex,
            gridProps = this.grid.properties,
            contentBox = gridProps.boxSizing !== 'border-box',
            gridLinesVWidth = gridProps.gridLinesVWidth;

        for (; i < count; i++) {
            columnWidth = this.getColumnWidth(i);
            if (columnWidth) {
                total += columnWidth;
                if (contentBox) {
                    total += gridLinesVWidth;
                }
            }
        }

        // add in fixed rule thickness excess
        if (gridProps.fixedLinesVWidth) {
            total += gridProps.fixedLinesHWidth - gridLinesVWidth;
        }

        return total;
    },

    /**
     * @memberOf Behavior#
     * @desc This exists to support "floating" columns.
     * @return {number} The total width of the fixed columns area.
     */
    getFixedColumnsMaxWidth: function() {
        return this.getFixedColumnsWidth();
    },

    /**
     * @memberOf Behavior#
     * @desc Set the scroll position in vertical dimension and notify listeners.
     * @param {number} y - the new y value
     */
    _setScrollPositionY: function(y) {
        this.setScrollPositionY(y);
        this.changed();
    },

    /**
     * @memberOf Behavior#
     * @desc Set the scroll position in horizontal dimension and notify listeners.
     * @param {number} x - the new x value
     */
    _setScrollPositionX: function(x) {
        this.setScrollPositionX(x);
        this.changed();
    },

    /**
     * @memberOf Behavior#
     * @desc The fixed row area has been clicked, massage the details and call the real function.
     * @param {Hypergrid} grid
     * @param {Object} mouse - event details
     */
    _fixedRowClicked: function(grid, mouse) {
        var x = this.translateColumnIndex(this.getScrollPositionX() + mouse.gridCell.x - this.getFixedColumnCount());
        var translatedPoint = new Point(x, mouse.gridCell.y);
        mouse.gridCell = translatedPoint;
        this.fixedRowClicked(grid, mouse);
    },

    /**
     * @memberOf Behavior#
     * @desc The fixed column area has been clicked, massage the details and call the real function.
     * @param {Hypergrid} grid
     * @param {Object} mouse - event details
     */
    _fixedColumnClicked: function(grid, mouse) {
        var translatedPoint = new Point(mouse.gridCell.x, this.getScrollPositionY() + mouse.gridCell.y - this.getFixedRowCount());
        mouse.gridCell = translatedPoint;
        this.fixedColumnClicked(grid, mouse);
    },

    /**
     * @memberOf Behavior#
     * @desc delegate setting the cursor up the feature chain of responsibility
     * @param {Hypergrid} grid
     */
    setCursor: function(grid) {
        grid.updateCursor();
        this.featureChain.setCursor(grid);
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling mouse move to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onMouseMove: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleMouseMove(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling tap to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onClick: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleClick(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling tap to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onContextMenu: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleContextMenu(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling wheel moved to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onWheelMoved: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleWheelMoved(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling mouse up to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onMouseUp: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleMouseUp(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling mouse drag to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onMouseDrag: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleMouseDrag(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling key down to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onKeyDown: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleKeyDown(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling key up to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onKeyUp: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleKeyUp(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling double click to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    onDoubleClick: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleDoubleClick(grid, event);
            this.setCursor(grid);
        }
    },
    /**
     * @memberOf Behavior#
     * @desc delegate handling mouse down to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseDown: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleMouseDown(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc delegate handling mouse exit to the feature chain of responsibility
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleMouseExit: function(grid, event) {
        if (this.featureChain) {
            this.featureChain.handleMouseExit(grid, event);
            this.setCursor(grid);
        }
    },

    /**
     * @memberOf Behavior#
     * @desc I've been notified that the behavior has changed.
     */
    changed: function() { this.grid.behaviorChanged(); },

    /**
     * @memberOf Behavior#
     * @desc The dimensions of the grid data have changed. You've been notified.
     */
    shapeChanged: function() { this.grid.behaviorShapeChanged(); },

    /**
     * @memberOf Behavior#
     * @desc The dimensions of the grid data have changed. You've been notified.
     */
    stateChanged: function() { this.grid.behaviorStateChanged(); },

    /**
     * @memberOf Behavior#
     * @return {boolean} Can re-order columns.
     */
    isColumnReorderable: function() {
        return this.deprecated('isColumnReorderable()', 'grid.properties.columnsReorderable', '2.1.3');
    },

    /**
     * @param {index} x - Data x coordinate.
     * @return {Object} The properties for a specific column.
     * @memberOf Behavior#
     */
    getColumnProperties: function(x) {
        var column = this.getColumn(x);
        return column && column.properties;
    },

    /**
     * @param {index} x - Data x coordinate.
     * @return {Object} The properties for a specific column.
     * @memberOf Behavior#
     */
    setColumnProperties: function(x, properties) {
        var column = this.getColumn(x);
        if (!column) {
            throw 'Expected column.';
        }
        var result = Object.assign(column.properties, properties);
        this.changed();
        return result;
    },

    /**
     * Clears all cell properties of given column or of all columns.
     * @param {number} [x] - Omit for all columns.
     * @memberOf Behavior#
     */
    clearAllCellProperties: function(x) {
        if (x !== undefined) {
            var column = this.getColumn(x);
            if (column) {
                column.clearAllCellProperties();
            }
        } else if (this.subgrids) {
            this.subgrids.forEach(function(dataModel) {
                for (var i = dataModel.getRowCount(); i--;) {
                    delete dataModel.getRow(i).__META;
                    // todo: test if optimizer wants following instead
                    // dataRow = dataModel.getRow(i);
                    // if (dataRow.__META !== undefined) { dataRow.__META = undefined; }
                }
            });
        }
    },

    /**
     * @memberOf Behavior#
     * @return {string[]} All the currently hidden column header labels.
     */
    getHiddenColumnDescriptors: function() {
        var tableState = this.grid.properties;
        var indexes = tableState.columnIndexes;
        var labels = [];
        var columnCount = this.getActiveColumnCount();
        for (var i = 0; i < columnCount; i++) {
            if (indexes.indexOf(i) === -1) {
                var column = this.getActiveColumn(i);
                labels.push({
                    id: i,
                    header: column.header,
                    field: column.name
                });
            }
        }
        return labels;
    },

    /**
     * @memberOf Behavior#
     * @return {number} The number of fixed columns.
     */
    getFixedColumnCount: function() {
        return this.grid.properties.fixedColumnCount;
    },

    /**
     * @memberOf Behavior#
     * @desc set the number of fixed columns
     * @param {number} n - the integer count of how many columns to be fixed
     */
    setFixedColumnCount: function(n) {
        this.grid.properties.fixedColumnCount = n;
    },

    /**
     * @summary The number of "fixed rows."
     * @desc The number of (non-scrollable) rows preceding the (scrollable) data subgrid.
     * @memberOf Behavior#
     * @return {number} The sum of:
     * 1. All rows of all subgrids preceding the data subgrid.
     * 2. The first `fixedRowCount` rows of the data subgrid.
     */
    getFixedRowCount: function() {
        return (
            this.getHeaderRowCount() +
            this.grid.properties.fixedRowCount
        );
    },

    /**
     * @memberOf Behavior#
     * @desc Set the number of fixed rows, which includes (top to bottom order):
     * 1. The header rows
     *    1. The header labels row (optional)
     *    2. The filter row (optional)
     *    3. The top total rows (0 or more)
     * 2. The non-scrolling rows (externally called "the fixed rows")
     *
     * @returns {number} Sum of the above or 0 if none of the above are in use.
     *
     * @param {number} The number of rows.
     */
    setFixedRowCount: function(n) {
        this.grid.properties.fixedRowCount = n;
    },

    /**
     * @memberOf Behavior#
     * @desc a dnd column has just been dropped, we've been notified
     */
    endDragColumnNotification: function() {},

    /**
     * @memberOf Behavior#
     * @return {null} the cursor at a specific x,y coordinate
     * @param {number} x - the x coordinate
     * @param {number} y - the y coordinate
     */
    getCursorAt: function(x, y) {
        return null;
    },

    /**
     * Number of _visible_ columns.
     * @memberOf Behavior#
     * @return {number} The total number of columns.
     */
    getActiveColumnCount: function() {
        return this.columns.length;
    },
    getColumnCount: function() {
        return this.deprecated('getColumnCount()', 'getActiveColumnCount()', '1.0.6', arguments);
    },

    /**
     * @summary Column alignment of given grid column.
     * @desc One of:
     * * `'left'`
     * * `'center'`
     * * `'right'`
     *
     * Cascades to grid.
     * @memberOf Behavior#
     * @desc Quietly set the horizontal scroll position.
     * @param {number} x - The new position in pixels.
     */
    setScrollPositionX: function(x) {
        /**
         * @memberOf Behavior#
         * @type {number}
         */
        this.scrollPositionX = x;
    },

    getScrollPositionX: function() {
        return this.scrollPositionX;
    },

    /**
     * @memberOf Behavior#
     * @desc Quietly set the vertical scroll position.
     * @param {number} y - The new position in pixels.
     */
    setScrollPositionY: function(y) {
        /**
         * @memberOf Behavior#
         * @type {number}
         */
        this.scrollPositionY = y;
    },

    getScrollPositionY: function() {
        return this.scrollPositionY;
    },

    /**
     * @memberOf Behavior#
     * @return {cellEditor} The cell editor for the cell at the given coordinates.
     * @param {CellEvent} editPoint - The grid cell coordinates.
     */
    getCellEditorAt: function(event) {
        return event.isDataColumn && event.column.getCellEditorAt(event);
    },

    /**
     * @memberOf Behavior#
     * @return {boolean} `true` if we should highlight on hover
     * @param {boolean} isColumnHovered - the column is hovered or not
     * @param {boolean} isRowHovered - the row is hovered or not
     */
    highlightCellOnHover: function(isColumnHovered, isRowHovered) {
        return isColumnHovered && isRowHovered;
    },

    /**
     * @memberOf Behavior#
     * @desc this function is a hook and is called just before the painting of a cell occurs
     * @param {window.fin.rectangular.Point} cell
     */
    cellPropertiesPrePaintNotification: function(cell) {

    },

    /**
     * @memberOf Behavior#
     * @desc this function is a hook and is called just before the painting of a fixed row cell occurs
     * @param {window.fin.rectangular.Point} cell
     */
    cellFixedRowPrePaintNotification: function(cell) {

    },

    /**
     * @memberOf Behavior#
     * @desc this function is a hook and is called just before the painting of a fixed column cell occurs
     * @param {window.fin.rectangular.Point} cell
     */
    cellFixedColumnPrePaintNotification: function(cell) {

    },

    /**
     * @memberOf Behavior#
     * @desc this function is a hook and is called just before the painting of a top left cell occurs
     * @param {window.fin.rectangular.Point} cell
     */
    cellTopLeftPrePaintNotification: function(cell) {

    },

    /**
     * @memberOf Behavior#
     * @desc swap src and tar columns
     * @param {number} src - column index
     * @param {number} tar - column index
     */
    swapColumns: function(source, target) {
        var columns = this.columns;
        var tmp = columns[source];
        columns[source] = columns[target];
        columns[target] = tmp;
        this.changed();
    },

    getColumnEdge: function(c, renderer) {
        return this.dataModel.getColumnEdge(c, renderer);
    },

    /**
     * @memberOf Behavior#
     * @return {object} The object at y index.
     * @param {number} y - the row index of interest
     */
    getRow: function(y) {
        return this.dataModel.getRow(y);
    },

    convertViewPointToDataPoint: function(unscrolled) {
        return new Point(
            this.getActiveColumn(unscrolled.x).index,
            unscrolled.y
        );
    },

    hasTreeColumn: function() {
        return false;
    },

    getSelectionMatrixFunction: function(selectedRows) {
        return function() {
            return null;
        };
    },

    getRowHeaderColumn: function() {
        return this.allColumns[this.rowColumnIndex];
    },

    getTreeColumn: function() {
        return this.allColumns[this.treeColumnIndex];
    },

    autosizeAllColumns: function() {
        this.checkColumnAutosizing(true);
        this.changed();
    },

    checkColumnAutosizing: function(force) {
        var autoSized = this.autoSizeRowNumberColumn() || this.autoSizeTreeColumn();

        this.allColumns.forEach(function(column) {
            autoSized = column.checkColumnAutosizing(force) || autoSized;
        });

        return autoSized;
    },

    autoSizeRowNumberColumn: function() {
        if (this.grid.properties.showRowNumbers && this.grid.properties.rowNumberAutosizing) {
            return this.getRowHeaderColumn().checkColumnAutosizing(true);
        }
    },

    autoSizeTreeColumn: function() {
        if (this.grid.properties.showTreeColumn && this.grid.properties.treeColumnAutosizing) {
            return this.getTreeColumn().checkColumnAutosizing(true);
        }
    },

    /**
     * @summary Get the given data controller.
     * @param {string} type
     * @returns {undefined|*} The data controller; or `undefined` if data controller unknown to data model.
     * @memberOf Behavior#
     */
    getController: function(type) {
        return this.dataModel.getController(type);
    },

    /**
     * @summary Set the given data controller(s).
     * @desc Triggers a shape change.
     * @param {string} typeOrHashOfTypes - One of:
     * * **object** - Hash of multiple data controllers, by type.
     * * **string** - Type of the single data controller given in `controller`.
     * @param {dataControlInterface} [controller] - Only required when 'hash' is a string; omit when `hash` is an object.
     * @returns {object} - Hash of all results, by type. Each member will be:
     * * The given data controller for that type when defined.
     * * A new "null" data controller, generated by the data model when the given data controller for that type was `undefined`.
     * * `undefined` - The data controller was unknown to the data model..
     * @memberOf Behavior#
     */
    setController: function(typeOrHashOfTypes, controller) {
        var results = this.dataModel.setController(typeOrHashOfTypes, controller);
        this.changed();
        return results;
    },

    prop: function(type, columnIndex, keyOrHash, value) {
        var result = this.dataModel.prop.apply(this.dataModel, arguments);
        if (result === undefined) {
            this.changed();
        }
        return result;
    },

    get charMap() {
        return this.dataModel.charMap;
    },

    getColumns: function() {
        return this.allColumns;
    },

    getActiveColumns: function() {
        return this.columns;
    },

    getHiddenColumns: function() {
        var visible = this.columns;
        var all = this.allColumns;
        var hidden = [];
        for (var i = 0; i < all.length; i++) {
            if (visible.indexOf(all[i]) === -1) {
                hidden.push(all[i]);
            }
        }
        hidden.sort(function(a, b) {
            return a.header < b.header;
        });
        return hidden;
    },

    getSelectedRows: function() {
        return this.grid.selectionModel.getSelectedRows();
    },

    getSelectedColumns: function() {
        return this.grid.selectionModel.getSelectedColumns();
    },

    getSelections: function() {
        return this.grid.selectionModel.getSelections();
    },

    getData: function() {
        return this.dataModel.getData();
    },

    getFilteredData: function() {
        return this.deprecated('getIndexedData()', 'getIndexedData', '1.2.0', arguments);
    },
    getIndexedData: function() {
       this.dataModel.getIndexedData();
    }
});


// define constants as immutable (i.e., !writable)
Object.defineProperties(Behavior.prototype, {
    treeColumnIndex: { value: -1 },
    rowColumnIndex: { value: -2 }
});


function warnBehaviorFeaturesDeprecation() {
    var featureNames = [], unregisteredFeatures = [], n = 0;

    this.features.forEach(function(FeatureConstructor) {
        var className = FeatureConstructor.prototype.$$CLASS_NAME || FeatureConstructor.name,
            featureName = className || 'feature' + n++;

        // build list of feature names
        featureNames.push(featureName);

        // build list of unregistered features
        if (!this.featureRegistry.get(featureName, true)) {
            var constructorName = FeatureConstructor.name || FeatureConstructor.prototype.$$CLASS_NAME || 'FeatureConstructor' + n,
                params = [];
            if (!className) {
                params.push('\'' + featureName + '\'');
            }
            params.push(constructorName);
            unregisteredFeatures.push(params.join(', '));
        }
    }, this);

    if (featureNames.length) {
        var sampleCode = 'Hypergrid.defaults.features = [\n' + join('\t\'', featureNames, '\',\n') + '];';

        if (unregisteredFeatures.length) {
            sampleCode += '\n\nThe following custom features are unregistered and will need to be registered prior to behavior instantiation:\n\n' +
                join('Features.add(', unregisteredFeatures, ');\n');
        }

        if (n) {
            sampleCode += '\n\n(You should provide meaningful names for your custom features rather than the generated names above.)';
        }

        console.warn('`grid.behavior.features` (array of feature constructors) has been deprecated as of version 2.1.0 in favor of `grid.properties.features` (array of feature names). Remove `features` array from your behavior and add `features` property to your grid state object (or Hypergrid.defaults), e.g.:\n\n' + sampleCode);
    }
}

function join(prefix, array, suffix) {
    return prefix + array.join(suffix + prefix) + suffix;
}


// synonyms

/**
 * Synonym of {@link Behavior#reindex}.
 * @name applyAnalytics
 * @deprecated
 * @memberOf Behavior#
 */
Behavior.prototype.applyAnalytics = Behavior.prototype.reindex;


// mix-ins
Behavior.prototype.mixIn(require('./subgrids'));
Behavior.prototype.mixIn(require('./rowProperties').mixin);


module.exports = Behavior;
