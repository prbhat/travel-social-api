var express = require('express');
var router = express.Router();
var request = require('request');
var winston = require('winston');

var SERVICE_PREFIX = 'Orchestration Service: '


router.post('/results', function (req, res) {

    winston.info(SERVICE_PREFIX + 'Request made to Orchestration service request:', req.body);

    var data = '';
    var offerRes = '';
    var priceRes = '';
    var winnerSelectionEnabled = "TRUE" === req.body.winnerselection.toUpperCase();

    // ***************** CRS SERVICE *****************
    var timeStartCRS = new Date().getTime();
    winston.info(SERVICE_PREFIX + 'Calling CRS service');

    request('http://localhost:3002/crs/results', function (error, response, crsbody) {
        if (error) {
            winston.error('Received error from CRS service: ', error);
            return;
        }
        winston.info(SERVICE_PREFIX + 'Received response from CRS service');
        var timeEndCRS = new Date().getTime();

        // ***************** Pre Cluster Filter SERVICE *****************
        var timeStartPreFilter = new Date().getTime();
        winston.info(SERVICE_PREFIX + 'Calling pre Cluster filter service');
        request({
            uri: 'http://localhost:3004/car/prefilter',
            method: 'POST',
            form: JSON.parse(crsbody),
        }, function (error, response, preClusteredFilteredResponse) {
            if (error) {
                next(error);
                return;
            }

            winston.info(SERVICE_PREFIX + 'Received response from pre Cluster filter service');
            var preClusteredFilteredRes = JSON.parse(preClusteredFilteredResponse);
            var timeEndPreFilter = new Date().getTime();

            // ***************** Cluster SERVICE *****************
            var timeStartCluster = new Date().getTime();
            winston.info(SERVICE_PREFIX + 'Calling Clustering service');
            request({
                uri: "http://localhost:3003/cluster/results",
                method: "POST",
                form: preClusteredFilteredRes,
            }, function (error, response, clusterbody) {
                if (error) {
                    winston.error('Received error from Clustering service: ', error);
                    return;
                }
                var offerRes = JSON.parse(clusterbody);
                winston.info(SERVICE_PREFIX + 'Received response from Clustering service');
                var timeEndCluster = new Date().getTime();

                // ***************** Pricing SERVICE *****************
                var timeStartPricing = new Date().getTime();
                winston.info(SERVICE_PREFIX + 'Calling price service');
                request({
                    uri: "http://localhost:3005/car/price",
                    method: "POST",
                    form: offerRes,
                }, function (error, response, pricedResponse) {
                    if (error) {
                        winston.error('Received error from Price Service');
                        return;
                    }

                    var startFilter = new Date().getTime();
                    var priceRes = JSON.parse(pricedResponse);
                    winston.info(SERVICE_PREFIX + 'Received response from price service');
                    var timeEndPricing = new Date().getTime();

                    // ***************** Post Cluster Deposit Type Filter SERVICE *****************
                    var timeStartPostDespositFilter = new Date().getTime();
                    winston.info(SERVICE_PREFIX + 'Calling deposit type filter service');
                    request({
                        uri: 'http://localhost:3004/car/filter/deposit_type',
                        method: 'POST',
                        form: priceRes
                    }, function (error, response, depositFilteredResponse) {
                        if (error) {
                            next(error);
                            return;
                        }

                        winston.info(SERVICE_PREFIX + 'Received response from deposit type filter service');
                        var depositFilteredRes = JSON.parse(depositFilteredResponse);
                        var timeEndPostDepositFilter = new Date().getTime();
                        if (winnerSelectionEnabled) {
                            // ***************** Winner selection SERVICE *****************
                            var timeStartWinner = new Date().getTime();
                            winston.info(SERVICE_PREFIX + 'Calling winner selection service');
                            request({
                                uri: "http://localhost:3006/car/winner",
                                method: "POST",
                                body: depositFilteredRes,
                                json: true
                            }, function (error, response, winnerResponse) {
                                if (error) {
                                    winston.error('Received error from winner selection Service');
                                    return;
                                }
                                winston.info(SERVICE_PREFIX + 'Received response from winner selection service');
                                var timeEndWinner = new Date().getTime();


                                // ***************** Post Cluster Filter SERVICE *****************
                                var timeStartPostFilter = new Date().getTime();
                                winston.info(SERVICE_PREFIX + 'Calling filter service');
                                request({
                                    uri: 'http://localhost:3004/car/filter',
                                    method: 'POST',
                                    body: winnerResponse,
                                    json: true
                                }, function (error, response, filteredResponse) {
                                    if (error) {
                                        next(error);
                                        return;
                                    }

                                    winston.info(SERVICE_PREFIX + 'Received response from filter service');
                                    var timeEndPostFilter = new Date().getTime();

                                    // ***************** Sort SERVICE *****************
                                    var timeStartSort = new Date().getTime();
                                    winston.info(SERVICE_PREFIX + 'Calling sort service (Python module)');
                                    var formattedSortRQ = "the_post=" + JSON.stringify(filteredResponse);
                                    request({
                                        uri: "http://localhost:8000/api/v1/posts/",
                                        method: "POST",
                                        form: formattedSortRQ,
                                    }, function (error, response, sortedResponse) {
                                        if (error) {
                                            winston.error('Received error from sort service');
                                            return;
                                        }
                                        var sortResBody = JSON.parse(response.body);
                                        var sortRS = JSON.parse(sortResBody.text)

                                        winston.info(SERVICE_PREFIX + 'Received response from sort service (Python module) ');
                                        var timeEndSort = new Date().getTime();
                                        // ***************** END OF SERVICE *****************

                                        var timeEndServiceCalls = new Date().getTime();

                                        var executionTimeCRS = timeEndCRS - timeStartCRS;
                                        var executionTimePreFilter = timeEndPreFilter - timeStartPreFilter;
                                        var executionTimeCluster = timeEndCluster - timeStartCluster;
                                        var executionTimePrice = timeEndPricing - timeStartPricing;
                                        var executionTimeWinner = timeEndWinner - timeStartWinner;
                                        var executionTimePostFilter = timeEndPostFilter - timeStartPostFilter;
                                        var executionTimeSort = timeEndSort - timeStartSort;

                                        var totalExecutionTime = executionTimePreFilter + executionTimeCluster +
                                            executionTimeWinner + executionTimePostFilter + executionTimeSort;
                                        sortRS.executionTime = totalExecutionTime;

                                        res.json(sortRS);

                                        winston.warn(SERVICE_PREFIX + '===============================================')
                                        winston.warn(SERVICE_PREFIX + 'Execution time excluding CRS and Pricing (ms) = ', totalExecutionTime);
                                        winston.warn(SERVICE_PREFIX + 'Execution time of CRS (ms) = ', executionTimeCRS);
                                        winston.warn(SERVICE_PREFIX + 'Execution time of Pre filter (ms) = ', executionTimePreFilter);
                                        winston.warn(SERVICE_PREFIX + 'Execution time of Cluster (ms) = ', executionTimeCluster);
                                        winston.warn(SERVICE_PREFIX + 'Execution time of Price (ms) = ', executionTimePrice);
                                        winston.warn(SERVICE_PREFIX + 'Execution time of Winner (ms) = ', executionTimeWinner);
                                        winston.warn(SERVICE_PREFIX + 'Execution time of Post filter (ms) = ', executionTimePostFilter);
                                        winston.warn(SERVICE_PREFIX + 'Execution time of Sort (ms) = ', executionTimeSort);
                                        winston.warn(SERVICE_PREFIX + '===============================================')


                                    }); // End of sort

                                }); // End of filter
                            }); // End of winner selection
                        }
                        else {

                            winston.warn(SERVICE_PREFIX + 'WINNER SELECTION DISABLED')
                            // ***************** Filter SERVICE *****************
                            var timeStartPostFilter = new Date().getTime();
                            winston.info(SERVICE_PREFIX + 'Calling post cluster filter service');
                            request({
                                uri: 'http://localhost:3004/car/filter',
                                method: 'POST',
                                form: priceRes,
                            }, function (error, response, filteredResponse) {
                                if (error) {
                                    next(error);
                                    return;
                                }

                                winston.info(SERVICE_PREFIX + 'Received response from post cluster filter service');
                                var filteredRes = JSON.parse(filteredResponse);
                                var timeEndPostFilter = new Date().getTime();

                                // ***************** Sort SERVICE *****************
                                var timeStartSort = new Date().getTime();
                                winston.info(SERVICE_PREFIX + 'Calling sort service (Python module)');
                                var formattedSortRQ = "the_post=" + filteredResponse;
                                request({
                                    uri: "http://localhost:8000/api/v1/posts/",
                                    method: "POST",
                                    form: formattedSortRQ,
                                }, function (error, response, sortedResponse) {
                                    if (error) {
                                        winston.error('Received error from sort service');
                                        return;
                                    }
                                    var sortResBody = JSON.parse(response.body);
                                    var sortRS = JSON.parse(sortResBody.text)

                                    winston.info(SERVICE_PREFIX + 'Received response from sort service (Python module) ');
                                    var timeEndSort = new Date().getTime();
                                    // ***************** END OF SERVICE *****************

                                    var timeEndServiceCalls = new Date().getTime();

                                    var executionTimeCRS = timeEndCRS - timeStartCRS;
                                    var executionTimePreFilter = timeEndPreFilter - timeStartPreFilter;
                                    var executionTimeCluster = timeEndCluster - timeStartCluster;
                                    var executionTimePrice = timeEndPricing - timeStartPricing;
                                    var executionTimePostFilter = timeEndPostFilter - timeStartPostFilter;
                                    var executionTimeSort = timeEndSort - timeStartSort;

                                    var totalExecutionTime = executionTimePreFilter + executionTimeCluster +
                                        executionTimePostFilter + executionTimeSort;
                                    sortRS.executionTime = totalExecutionTime;

                                    res.json(sortRS);

                                    winston.warn(SERVICE_PREFIX + '===============================================')
                                    winston.warn(SERVICE_PREFIX + 'Execution time excluding CRS and Pricing (ms) = ', totalExecutionTime);
                                    winston.warn(SERVICE_PREFIX + 'Execution time of CRS (ms) = ', executionTimeCRS);
                                    winston.warn(SERVICE_PREFIX + 'Execution time of Pre filter (ms) = ', executionTimePreFilter);
                                    winston.warn(SERVICE_PREFIX + 'Execution time of Cluster (ms) = ', executionTimeCluster);
                                    winston.warn(SERVICE_PREFIX + 'Execution time of Price (ms) = ', executionTimePrice);
                                    winston.warn(SERVICE_PREFIX + 'Execution time of Winner (ms) = N/A');
                                    winston.warn(SERVICE_PREFIX + 'Execution time of Post filter (ms) = ', executionTimePostFilter);
                                    winston.warn(SERVICE_PREFIX + 'Execution time of Sort (ms) = ', executionTimeSort);
                                    winston.warn(SERVICE_PREFIX + '===============================================')

                                }); // End of sort
                            }); // End of Post Cluster Filter
                        }
                    }); //End of deposite type filter
                }); // End of price
            }); // End of cluster
        }); // End Pre Cluster Filter
    }); // End of crs


}); // End of router


module.exports = router;
