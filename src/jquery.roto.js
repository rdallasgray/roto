/*!
 * Roto @VERSION
 * http://github.com/rdallasgray/roto
 * 
 * A simple, flexible, touch-capable scrolling plugin for jQuery
 * 
 * Copyright @YEAR Robert Dallas Gray. All rights reserved.
 * Provided under the FreeBSD license: https://github.com/rdallasgray/roto/blob/master/LICENSE.txt
*/
(function($){
	$.fn.roto = function(options) {
		var defaults = {
			btnPrev: ".prev",
			btnNext: ".next",
			direction: "h",
			shift_duration: 200,
			shift_bezier: [0,0,0,1],
			drift_duration: 1800,
			drift_factor: 500,
			drift_bezier: [0,0,0.3,1],
			bounce_duration: 400,
			bounce_bezier: [0,0.5,0.5,1],
			pull_divisor: 3,
			timer_interval: 50,
			msToS: 1000,
			disable_transitions: false,
			snap: true
		};
		options = $.extend(defaults, options || {});
		
		var msToS = 1000;

		var isTouchDevice = false;
	    try {
	        document.createEvent("TouchEvent");
	        isTouchDevice = true;
	    } catch (e) {
	        isTouchDevice = false;
	    }
				
		// names of events are dependent on whether device uses touch events
		var scrollEvents = isTouchDevice ?
			{ start: "touchstart", move: "touchmove", end: "touchend" } :
			{ start: "mousedown", move: "mousemove", end: "mouseup" };

		// get the correct scroll events for touch and desktop devices
		var wrapScrollEvent = function(e) {
			if (isTouchDevice && typeof e.originalEvent.touches !== "undefined") {
				return e.originalEvent.touches[0];
			}
			return e;
		};
		
		// get correct transition css properties and events, if supported
		var transformProp = null, transitionProp = null, transitionEvent = null;
		if (!options.disable_transitions) {
			var body = document.body || document.documentElement,
				transform = {
					transform: "transform", 
					MozTransform: "-moz-transform", 
					WebkitTransform: "-webkit-transform",
				},
				transition = {
					transition: { prop: "transition", "event": "transitionend" },
					MozTransition: { prop: "-moz-transition", "event": "transitionend" },
					WebkitTransition: { prop: "-webkit-transition", "event": "webkitTransitionEnd" },
				};
			for (var i in transform) {
				if (typeof body.style[i] !== "undefined") {
					transformProp = transform[i];
					break;
				}
			}
			for (var i in transition) {
				if (typeof body.style[i] !== "undefined") {
					transitionProp = transition[i].prop, transitionEvent = transition[i].event;
					break;
				}
			}
		}
		
		return this.each(function() {
			var orientations = { 
					h: { measure: "Width", offsetName: "left", coOrd: "X" },
					v: { measure: "Height", offsetName: "top", coOrd: "Y" }
				},
				// names of dimensions are dependent on whether the roto is horizontal or vertical
				dimensions = orientations[options.direction],
				// the element containing the buttons and ul
				container = $(this),
				// the ul containing the elements to be rotoed, and a cache of its li subelements
				ul = container.find("ul").first(), listItems = ul.find("li"),
				// the starting offset of the ul (to prevent problems in IE7)
				startOffset = 0,
				// the maximum offset from starting position that the roto can be moved
				maxOffset = 0,
				// the minimum offset from starting position that the roto can be moved (to be calculated below)
				minOffset = 0,
				// the offset to pointer tracking
				trackingOffset = 0,
				// the last non-zero direction of travel measured
				lastValidDir = -1,
				// the inner width or height of the container element
				containerMeasure = 0,
				// the total width or height of the contents of the ul element
				rotoMeasure = 0,
				// unique identification of the overall container, to be used in namespacing events
				containerId = (typeof container.attr("id") !== undefined) ? container.attr("id") : new Date().getTime() + "",
				// if transforms are supported, the string giving the css property to be animated
				animatedProp = null,
				// basic setting for the css transition property
				transitionStr = null,
				// whether animations are running
				running = false,
				// whether the rotoChange event has already been primed
				changeEventPrimed = false,
				// cache of the previous and next button elements
				prevButton = container.find(options.btnPrev), nextButton = container.find(options.btnNext);
					
			// set required styles
			container.css({ overflow: "hidden", position: "relative" });
			ul.css({ position: "relative", whiteSpace: "nowrap", padding: 0, margin: 0 });
			listItems.css({ display: "block", "float": "left", listStyle: "none" });
			
			var changes = 0;
			// set up transitions
			var setTransitions = function() {
					if (transitionProp !== null) {
						var opt = {};
						if (transitionStr === null) {
							transitionStr = [transformProp, " ", options.shift_duration/msToS, "s ease 0s"].join("");
						}
						opt[transitionProp] = transitionStr;
						ul.css(opt);
					}
				},
				unsetTransitions = function() {
					if (transitionProp !== null) {
						var opt = {};
						opt[transitionProp] = "none";
						ul.css(opt);
					}
				},
				// support both jQuery.animate and css transitions
				doAnimation = function(element, css, duration, easing, callback) {
					var _callback = callback;
					if (!changeEventPrimed) {
						_callback = function() {
							notifyChanged();
							callback();
						}
						changeEventPrimed = true;
					}
					if (transitionProp !== null) {
						var opt = {};
						opt[transitionProp + "-duration"] = duration/msToS + "s";
						opt[transitionProp + "-timing-function"] = ["cubic-bezier(", options[easing + "_bezier"].join(","), ")"].join("");
						element.css(opt);
						element.data("animationCallback", _callback);
						element.unbind(transitionEvent);
						element.one(transitionEvent, function() {
							element.data("animationCallback", null);
							_callback();
						});
						element.css(css);
					}
					else {
						element.animate(css, duration, $.bez(options[easing + "_bezier"]), _callback);
					}
				},
				stopAnimation = function(element) {
					if (transitionProp !== null) {
						var offset = getCurrentOffset();
						unsetTransitions();
						if (typeof element.data("animationCallback") === "function") {
							element.data("animationCallback")();
							element.data("animationCallback", null);
						}
						ul.css(getAnimatedProp(offset));
					}
					else {
						element.stop();
					}
				},
				notifyChanged = function() {
					container.trigger("rotoChange", [getNearestListItemTo(getCurrentOffset(), lastValidDir)[0]]);
					changeEventPrimed = false;
				};
				
			// prevent webkit flicker	
			if (transitionProp === "-webkit-transition") ul.css("-webkit-backface-visibility", "hidden");

			// if prev/next buttons don't seem to be inside the container, look for them outside
			if (prevButton.length === 0 && options.btnPrev === defaults.btnPrev) {
				if (container.attr("id")) {
					prevButton = $("#"+container.attr("id")+"-prev");
					nextButton = $("#"+container.attr("id")+"-next");
				}
			}

			// remeasure the container and derive the minimum offset allowed
			// the minimum offset is the total measure of the listItems - the measure of the ul
			var remeasure = function() {
				containerMeasure = Math.ceil(ul.parent()[dimensions.measure.toLowerCase()]()),
				minOffset = Math.ceil(rotoMeasure - containerMeasure + startOffset) * -1;
				if (options.snap) {
					minOffset = getSnapMove(minOffset, -1);
				}
			};

			// get the css property to animate based on whether transforms are supported
			var getAnimatedProp = function(move) {
				var opt = {};
				if (transformProp !== null) {
					if (animatedProp === null) {
						var use3d = isTouchDevice ? "3d" : "",
							translateStr = (use3d === "3d") ? "(Xpx,Ypx,0px)" : "(Xpx,Ypx)",
							oppositeCoOrd = { X: "Y", Y: "X"};
						animatedProp = ["translate", use3d, 
							translateStr.replace(oppositeCoOrd[dimensions.coOrd], "0")].join("");
					}
					opt[transformProp] = animatedProp.replace(dimensions.coOrd, move);
				}
				else {
					opt[dimensions.offsetName] = move + "px";
				}
				return opt;
			};
			
			// get the current offset position of the ul, dependent on whether transforms are supported
			var getCurrentOffset = function() {
				var cssPosition = ul.position()[dimensions.offsetName] - startOffset;
				if (transformProp === null) return cssPosition;
				var transformStr = ul.css(transformProp),
					matches = transformStr.match(/\-?[0-9]+/g);
				
				if (matches === null) return cssPosition;
				
				var val = (dimensions.coOrd === 'X') ? matches[4] : matches[5];
				return parseInt(val);
			};
			
			// find the list element nearest the given offset, and its position
			var getNearestListItemTo = function(offset, dir) {
				var pos = maxOffset,
					dir = (dir === 0) ? lastValidDir : dir,
					lis = (dir > 0) ? listItems.get().reverse() : listItems,
					el = listItems.get(0);
				$.each(lis, function(idx, el) {
					// set pos to the position of the current listItem
					pos = -1 * Math.ceil($(el).position()[dimensions.offsetName]);
					// if the position is beyond the offset, break the loop
					if (pos * dir >= offset * dir) {
						return false;
					}
				});
				return [el, pos];
			};
			
			// get the position of the listitem nearest the given offset
			var getSnapMove = function(offset, dir) {
				return getNearestListItemTo(offset, dir)[1];
			};

			// enable or disable the previous and next buttons based on roto conditions
			var switchButtons = function() {
				// if the total measure of the listItems extends beyond the end of the ul, enable the next button
				if (rotoMeasure > (containerMeasure - getCurrentOffset())) {
					nextButton.removeAttr("disabled");
				}
				else nextButton.attr("disabled", "disabled");

				// if the listItems are offset beyond the start of the ul, enable the previous button
				if (getCurrentOffset() < maxOffset) {
					prevButton.removeAttr("disabled");
				}
				else prevButton.attr("disabled", "disabled");
			};
		
			// shift the listItems one ul width in the given direction
			var rotoShift = function(dir) {
				var move = 0;
				// do nothing if the animation is already running
				if (running) return;
				running = true;
				setTransitions();

				// internal function to move the listitems by the calculated amount
				var doShift = function(move) {
					doAnimation(ul, getAnimatedProp(move), options.shift_duration, "shift", function() {
						switchButtons();
						running = false;
					});
				};

				if (dir < 0) {
					// if we're moving forwards, find the element nearest the end of the container
					move = Math.max(getSnapMove(getCurrentOffset() - containerMeasure, dir), minOffset);
				}
				else {
					// if we're moving backwards, find the element one container width towards the start of the container
					move = Math.min(getSnapMove(getCurrentOffset() + containerMeasure, dir), maxOffset);
				}
				// move the offsetElement to the start of the container
				doShift(move);
			};
			
			// track the ul to movement of the pointer
			var rotoTrack = function(pointerMove) {
				var move = Math.ceil(pointerMove + trackingOffset);
				// allow user to pull the ul beyond the max/min offsets
				if (move < (maxOffset + containerMeasure/options.pull_divisor) && move > (minOffset - containerMeasure/options.pull_divisor)) {
					ul.css(getAnimatedProp(move));
				}
			};
			
			// continue ul movement inertially based on pointer speed
			var rotoDrift = function() {
				var speed_dir = timer.getPointerSpeed(),
					speed = speed_dir[0], dir = speed_dir[1];
				if (speed === 0) {
					switchButtons();
					if (!options.snap) {
						if (!changeEventPrimed && trackingOffset !== getCurrentOffset()) notifyChanged();
						return;
					};
				}
				// distance to rotoDrift
				var distance = speed * options.drift_factor * dir,
					move = distance + getCurrentOffset();
				if (move > maxOffset) move = maxOffset;
				else if (move < minOffset) move = minOffset;
				else if (options.snap) move = getSnapMove(move, dir);
				
				doAnimation(ul, getAnimatedProp(move), options.drift_duration, "drift", function() {
					switchButtons();
				});
			};
			
			// bounce the ul elastically after it's pulled beyond max or min offsets
			var bounceBack = function(dir) {
				var end = (dir < 0) ? minOffset : maxOffset;
				doAnimation(ul, getAnimatedProp(end), options.bounce_duration, "bounce", function() {
					switchButtons();
				});
			};
						
			// timer to calculate speed of pointer movement
			var timer = function() {
				var startCoOrd = 0, currentCoOrd = 0, initialCoOrd = 0,
					chunker = null,
					chunk = { startCoOrd: 0, endCoOrd: 0 };
				
				return {
					start: function() {
						initialCoOrd = startCoOrd = currentCoOrd;
						//only measure speed in the final 50ms of movement
						chunker = window.setInterval(function() {
							chunk.startCoOrd = startCoOrd;
							chunk.endCoOrd = currentCoOrd;
							startCoOrd = currentCoOrd;
						}, options.timer_interval);
					},
					stop: function() {
						clearInterval(chunker);
						chunk.endCoOrd = currentCoOrd;
					},
					getPointerSpeed: function() {
						var translation = chunk.endCoOrd - chunk.startCoOrd,
						 	distance = Math.abs(translation),
							speed = distance/options.timer_interval,
							dir_value = (translation === 0) ? chunk.endCoOrd - initialCoOrd : translation,
							dir = (dir_value <= 0) ? ((dir_value === 0) ? 0 : -1) : 1;
						if (dir !== 0) lastValidDir = dir;
						return [speed, dir];
					},
					setCurrentCoOrd: function(coOrd) {
						currentCoOrd = coOrd;
					}
				}
			}();

			$(window).resize(function() {
				containerMeasure = ul.parent()[dimensions.measure.toLowerCase()](),
				remeasure();
				switchButtons();
			});

			// bind scroll events
			ul.bind(scrollEvents.start + ".roto." + containerId, function(e) {
				stopAnimation(ul);
				running = false;
				trackingOffset = getCurrentOffset();
				var linkElements = ul.find("a"),
					oldLinkEvents = {};

				if (!isTouchDevice) {
					e.preventDefault(); // prevent drag behaviour
					if (document.ondragstart !== undefined) {
						ul.find("a, img").one("dragstart", function(f) { f.preventDefault(); });
					}
					if (linkElements.length > 0) {
						$(document).one(scrollEvents.move + ".roto." + containerId, function(f) {
							// intially prevent link elements responding to clicks at start of ul tracking
							linkElements.one("click.roto." + containerId, function(f) { f.preventDefault(); });
							// gather any events attached to linkElements before unbinding
							$.each(linkElements.data('events'), function(eventName, events) {
								oldLinkEvents[eventName] = [];
								$.each(events, function(i, event) {
									oldLinkEvents[eventName].push(event);
								});
							});
							// prevent linkElements responding to other events during ul tracking
							linkElements.unbind();
							// prevent linkElements responding to clicks during ul tracking
							linkElements.bind("click.roto." + containerId, function(g) {
								g.preventDefault();
							});
						});
					}
				}
				e = wrapScrollEvent(e);
				var startCoOrd = e["screen"+dimensions.coOrd];
				timer.setCurrentCoOrd(startCoOrd);

				// scrolling has started, so begin tracking pointer movement and measuring speed
				$(document).bind(scrollEvents.move + ".roto." + containerId, function(f) {
					f.preventDefault();
					f = wrapScrollEvent(f);
					timer.setCurrentCoOrd(f["screen"+dimensions.coOrd]);
					rotoTrack(f["screen"+dimensions.coOrd] - startCoOrd);
				});
				
				// user stopped scrolling
				$(document).one(scrollEvents.end, function() {
					timer.stop();
					setTransitions();
					if (getCurrentOffset() > maxOffset || getCurrentOffset() < minOffset) {
						bounceBack(getCurrentOffset() - maxOffset);
					}
					else {
						rotoDrift();
					}
					$(document).unbind(scrollEvents.move + ".roto." + containerId);
					if (!isTouchDevice && linkElements.length > 0) {
						window.setTimeout(function() {
							// reattach old events to linkElements after a short delay
							linkElements.unbind("click.roto." + containerId);
							$.each(oldLinkEvents, function(eventName, events) {
								$.each(events, function(f, event) {
									linkElements.bind(event.type + "." + event.namespace, event.data, event.handler);
								});
							});
						}, 250);
					}
				});
				timer.start();
			});

			if (options.btnPrev) {
				prevButton.click(function() {
					return rotoShift(1);
				});
			}
			if (options.btnNext) {
				nextButton.click(function() {
					return rotoShift(-1);
				});
			}

			// measure the total width or height of the elements contained in the ul
			// if roto is horizontal, we have to individually measure each listItem
			if (options.direction === 'h') {
				// for each element, add the outer dimension of the element including margin and padding
				listItems.each(function(idx, el) {
					rotoMeasure += Math.ceil($(el)["outer"+dimensions.measure](true));
				});
				// set the dimension of the ul to what we measured. we need the buffer to cope with Firefox's decimal computed css measurements
				ul[dimensions.measure.toLowerCase()](rotoMeasure + (Math.ceil(rotoMeasure/100)));
			}
			else {
				// if roto is vertical we can use a simpler method to calculate size:
				// just find the position of the last element and add its outer dimension, including margin and padding
				var last = listItems.last();
				rotoMeasure = Math.round($(last).position()[dimensions.offsetName] + $(last)["outer"+dimensions.measure](true));
			}
			
			if (rotoMeasure <= containerMeasure) {
				// if the listItems don't fill the width of the ul, we don't need to show the previous or next buttons
				if (options.btnPrev) {
					prevButton.hide();
				}
				if (options.btnNext) {
					nextButton.hide();
				}
				return;
			}
	
			// check what state the buttons need to be in, and measure the listitems
			startOffset = Math.ceil(getCurrentOffset());
			remeasure();
			switchButtons();
		});
	}
})(jQuery);

