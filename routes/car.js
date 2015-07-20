var express = require('express');
var router = express.Router();
var request = require('request');
var winston = require('winston');
var properties = require ("properties");
var async = require ("async");

var FOURSQUARE_URI = 'https://api.foursquare.com/v2/venues/explore?near=San%20Francisco&oauth_token=K4CYK3B1Z4O0LXD0BYMX2S4YE0ZPACNYMGKWQCELDRE0KQVM&v=20150715'


router.get('/api', function(req, res) {

    // Make call to the Foursquare API
    request({
            uri: FOURSQUARE_URI,
            method: 'GET',
        }, function (error, response) {

          if (error) {
            winston.error('===== Error While Getting Data from Foursquare====');
            callback(null);
          } 
          else {
            var foursquare_response = JSON.parse(response.body);
            winston.info('======= Got Results from Foursquare ======== ');

            var items = foursquare_response.response.groups[0].items
            var topVenues = []

            // Get top venues
            for(var i = 0; i < items.length; i++) {
                topVenues.push(items[i].venue.name)

            }

            res.send(topVenues);
          }
        }).end();
});


module.exports = router;
