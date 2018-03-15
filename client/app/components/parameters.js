import { find } from 'underscore';
import moment from 'moment';

import template from './parameters.html';
import queryBasedParameterTemplate from './query-based-parameter.html';
import parameterSettingsTemplate from './parameter-settings.html';


const ParameterSettingsComponent = {
  template: parameterSettingsTemplate,
  bindings: {
    resolve: '<',
    close: '&',
    dismiss: '&',
  },
  controller($sce, Query) {
    'ngInject';

    this.trustAsHtml = html => $sce.trustAsHtml(html);
    this.parameter = this.resolve.parameter;

    if (this.parameter.queryId) {
      Query.get({ id: this.parameter.queryId }, (query) => {
        this.queries = [query];
      });
    }

    this.searchQueries = (term) => {
      if (!term || term.length < 3) {
        return;
      }

      Query.search({ q: term }, (results) => {
        this.queries = results;
      });
    };
  },
};

function optionsFromQueryResult(queryResult) {
  const columns = queryResult.data.columns;
  const numColumns = columns.length;
  let options = [];
  // If there are multiple columns, check if there is a column
  // named 'name' and column named 'value'. If name column is present
  // in results, use name from name column. Similar for value column.
  // Default: Use first string column for name and value.
  if (numColumns > 0) {
    let nameColumn = null;
    let valueColumn = null;
    columns.forEach((column) => {
      const columnName = column.name.toLowerCase();
      if (columnName === 'name') {
        nameColumn = column.name;
      }
      if (columnName === 'value') {
        valueColumn = column.name;
      }
      // Assign first string column as name and value column.
      if (nameColumn === null) {
        nameColumn = column.name;
      }
      if (valueColumn === null) {
        valueColumn = column.name;
      }
    });
    if (nameColumn !== null && valueColumn !== null) {
      options = queryResult.data.rows.map((row) => {
        const queryResultOption = {
          name: row[nameColumn],
          value: row[valueColumn],
        };
        return queryResultOption;
      });
    }
  }
  return options;
}

function updateCurrentValue(param, options) {
  const found = find(options, option => option.value === param.value) !== undefined;

  if (!found) {
    param.value = options[0].value;
  }
}

const QueryBasedParameterComponent = {
  template: queryBasedParameterTemplate,
  bindings: {
    param: '<',
    queryId: '<',
  },
  controller(Query) {
    'ngInject';

    this.$onChanges = (changes) => {
      if (changes.queryId) {
        Query.resultById({ id: this.queryId }, (result) => {
          const queryResult = result.query_result;
          this.queryResultOptions = optionsFromQueryResult(queryResult);
          updateCurrentValue(this.param, this.queryResultOptions);
        });
      }
    };
  },
};

function ParametersDirective($location, $uibModal) {
  function getChangeIndex(n, o) {
    for (let i = 0; i < n.length; i += 1) {
      if (n[i] !== o[i]) {
        return i;
      }
    }
    return [];
  }
  return {
    restrict: 'E',
    transclude: true,
    scope: {
      parameters: '=',
      syncValues: '=?',
      editable: '=?',
      changed: '&onChange',
    },
    template,
    link(scope) {
      scope.getPairedToInputIndex = (param) => {
        let index;
        if (param.type === 'enum' && param.name.endsWith('$From')) {
          scope.parameters.forEach((searchParam, i) => {
            if (searchParam.type === 'enum' && searchParam.name.split('$')[0] === param.name.split('$')[0]
              && searchParam.name.split('$')[1] === 'To') {
              index = i;
            }
          });
        }
        return index;
      };
      scope.getPairedFromInputIndex = (param) => {
        let index;
        if (param.name.endsWith('$To')) {
          scope.parameters.forEach((searchParam, i) => {
            if (searchParam.type === 'enum' && searchParam.name.split('$')[0] === param.name.split('$')[0]
              && searchParam.name.split('$')[1] === 'From') {
              index = i;
            }
          });
        }
        return index;
      };
      // is this the correct location for this logic?
      if (scope.syncValues !== false) {
        scope.$watch('parameters', () => {
          if (scope.changed) {
            scope.changed({});
          }
          scope.parameters.forEach((param) => {
            if (param.value !== null || param.value !== '') {
              $location.search(`p_${param.name}`, param.value);
            }
          });
        }, true);
        scope.enumValue = Array(scope.parameters.length);
        scope.$watch('enumValue', (n, o) => {
          if (scope.changed) {
            const changedIndex = getChangeIndex(n, o);
            if (n[changedIndex]) {
              if (n[changedIndex] === '$Custom_date') {
                scope.parameters[changedIndex].ngModel = moment().format('YYYY-MM-DD');
              } else if (n[changedIndex] === moment().add(-1, 'days').format('YYYY-MM-DD') && scope.parameters[changedIndex].name.endsWith('$From')) {
                scope.parameters[changedIndex].ngModel = moment(n[changedIndex]).format('YYYY-MM-DD');
                scope.parameters[scope.getPairedToInputIndex(scope.parameters[changedIndex])].ngModel
                  = moment().format('YYYY-MM-DD');
              } else if (scope.parameters[changedIndex].name.endsWith('$From')) {
                scope.parameters[changedIndex].ngModel = moment(n[changedIndex]).format('YYYY-MM-DD');
                scope.parameters[scope.getPairedToInputIndex(scope.parameters[changedIndex])].ngModel
                  = moment().add(1, 'days').format('YYYY-MM-DD');
              } else {
                scope.parameters[changedIndex].ngModel = moment(n[changedIndex]).format('YYYY-MM-DD');
              }
            }
            scope.changed({});
          }
        }, true);
      }

      // These are input as newline delimited values,
      // so we split them here.
      scope.extractEnumOptions = (enumOptions) => {
        if (enumOptions) {
          return enumOptions.split('\n');
        }
        return [];
      };
      scope.mapOptions = (option) => {
        if (option) {
          if (option.startsWith('$')) {
            return option.slice(1).replace('_', ' ');
          }
          return option;
        }
        return [];
      };
      scope.mapOptionValues = (option) => {
        const humanTimeEnum = ['today', 'yesterday', 'last week'];
        if (option.startsWith('$')) {
          if (humanTimeEnum.indexOf(scope.mapOptions(option).toLowerCase()) > -1) {
            let date;
            const today = moment();
            switch (scope.mapOptions(option).toLowerCase()) {
              case 'today': {
                date = today.format('YYYY-MM-DD');
                break;
              }
              case 'yesterday': {
                const yesterday = moment().add(-1, 'days');
                date = yesterday.format('YYYY-MM-DD');
                break;
              }
              case 'last week': {
                const lastweek = moment().add(-6, 'days');
                date = lastweek.format('YYYY-MM-DD');
                break;
              }
              default: {
                return '';
              }
            }
            return date;
          }
        } else {
          return moment(option).format('YYYY-MM-DD');
        }
        return option;
      };
      scope.hideEnumToDate = (index) => {
        if (scope.parameters[index].type === 'enum' && scope.parameters[index].name.endsWith('$To') &&
          scope.enumValue[scope.getPairedFromInputIndex(scope.parameters[index])] !== '$Custom_date') {
          return true;
        }
        return false;
      };
      scope.showParameterSettings = (param) => {
        $uibModal.open({
          component: 'parameterSettings',
          resolve: {
            parameter: param,
          },
        });
      };
      scope.clearParam = (param, index) => {
        if (param.name.endsWith('$To')) {
          param.value = '';
          scope.enumValue[index] = '';
        } else {
          param.value = '';
          scope.enumValue[index] = '';
          const pairedIndex = scope.getPairedToInputIndex(param);
          scope.parameters[pairedIndex].value = '';
          scope.enumValue[pairedIndex] = '';
        }
      };
    },
  };
}

export default function init(ngModule) {
  ngModule.directive('parameters', ParametersDirective);
  ngModule.component('queryBasedParameter', QueryBasedParameterComponent);
  ngModule.component('parameterSettings', ParameterSettingsComponent);
}
