/* eslint-env browser */
/* globals fin */

'use strict';

var grid;

window.onload = function() {
    var Hypergrid = fin.Hypergrid;

    grid = new Hypergrid('div#example');

    grid.setData([
        { value: 3 },
        { value: 4 },
        { value: -4 },
        { value: 5 }
    ]);

    grid.behavior.dataModel.getFields().push('squared');
    grid.behavior.dataModel.getHeaders().push('squared');
    grid.behavior.dataModel.getCalculators().push(square);

    // recreate to include new column
    grid.behavior.createColumns();

    // force type of new column to 'number' because current auto-detect does not know about calculated columns
    grid.behavior.setColumnProperties(1, { type: 'number' });

    grid.installPlugins([
        Hypergrid.Hyperfilter, // object API instantiation; `$$CLASS_NAME` defined so ref saved in `grid.plugins.hyperfilter`
        Hypergrid.Hypersorter // object API instantiation to grid.plugins; no `name` or `$$CLASS_NAME` defined so no ref saved
    ]);

    grid.filter = grid.plugins.hyperfilter.create();

    grid.setState({ showFilterRow: true });

    grid.repaint();

    function square(dataRow, columnName) {
        return dataRow.value * dataRow.value;
    }
};

