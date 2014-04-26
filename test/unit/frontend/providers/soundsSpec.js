'use strict';

define(['angular-mocks', 'frontend/providers/sounds'], function(mocks) {
  describe('Sounds provider', function() {

    var sounds, $window;
    
    beforeEach(mocks.module("DarkWallet.providers"));
    beforeEach(mocks.inject(['sounds', '$window', function(_sounds_, _$window_) {
      sounds = _sounds_;
      $window = _$window_;
      var el = $window.document.createElement('div');
      el.setAttribute('id', 'fixed');
      $window.document.body.appendChild(el);
    }]));
    
    it('plays', function() {
      sounds.play('beep');
      var html = '<audio autoplay="autoplay"><source src="../sound/beep.opus" type="audio/ogg"></audio>';
      expect($window.document.getElementById('fixed').innerHTML).toBe(html);
    });
  });
});