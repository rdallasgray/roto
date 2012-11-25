What is Roto?
=============
A simple, flexible, touch-capable scrolling plugin for jQuery.
See a demo at http://rdallasgray.github.com/roto/

Roto takes an html unordered list (of anything) and makes it smoothly, swipeably scrollable on both desktop and touch devices.

Example uses include image carousels, listboxes, slideshows, etc.

Roto comes with a minimum of styling, so that you can make it look and behave however you want. It plays nicely with other plugins (Fancybox being an example), making it lightweight but very functional and flexible.


How do I use it?
----------------
1. Create a div or other block-level element. Give it an id or a classname that you can use to identify it. Let's call this the container.
2. Put another element inside it; let's call this element the rotoFrame. If you want to be explicit, give this element the class "rotoFrame". That's not necessary, but it prevents Roto presuming that the first element inside the container is the rotoFrame, thus allowing you to put other elements into the container first. You can also specify a selector to use instead of ".rotoFrame" in the options, if you want.
3. Put some more elements inside the rotoFrame, containing whatever you want to be rotoed (normally images, or images inside links, but whatever you like).
4. Optionally, add a couple of buttons with classnames 'prev' and 'next' inside the containing element (you can put them outside too -- see the section below on options);
5. Call roto on the containing element, e.g. `$("#roto-div").roto()`.

See the demo for an example.


Are there dependencies?
-----------------------
The only dependency is my own Bez plugin (https://github.com/rdallasgray/bez), which is used to create jQuery-compatible easing functions from cubic-bezier co-ordinates. That's just for compatibility with browsers which don't support CSS transitions, so if you're only supporting newer browsers, you don't need it. Bez is compiled into the minified distribution of Roto by default, so you don't need to separately include it.


What else do I need to know?
----------------------------
Roto works best if you call it using $(window).load() rather than $(document).ready(). This is because Webkit-based browsers don't know the dimensions of images at $(document).ready() time, and Roto relies on those dimensions. This can mean you see a 'Flash of Unstyled Content' as the script hasn't applied styles to the rotoed elements before the page begins to display, so you may want to style your rotoed elements with "visibility: hidden" until the window is loaded. Of course, if you're giving all your images explicit dimensions anyway, you can use $(document).ready().

Roto will also auto-disable a rotoed element if its container becomes larger than its contents (so it doesn't actually need to scroll). You can also programmatically enable and disable rotoed elements using events (see below).


What about events?
------------------
Roto fires an event called `rotoChange` when the position of the roto content is changed (and on completion of any animations). You can listen for this event on the rotoed container and use it, for example, to change other content in your page when the roto is moved. The event passes the element leftmost or topmost in the roto as data. So you could do something like:

`$("#roto").bind("rotoChange", function(event, element) { $(element).css("color", "red") });`

Roto also listens for the events `rotoGoto`, `rotoShift`,  `rotoContentChange`, `rotoEnable` and `rotoDisable`.

You can pass one of three types of values as data to the "rotoGoto" event: a number, a jQuery-wrapped element, or a string. 

The number should be an index into the set of elements contained in the rotoed container (starting from zero);
The jQuery-wrapped element should be one of the elements in the container (e.g. `$("#myelement")`).
In each of those cases, roto will zip to the given item.

The string should be either "next" or "prev", in which case the roto will advance or retreat one item, or an integer followed by "px", in which case the roto will go to the specified offset (e.g. "-200px");

The `rotoShift` event takes one argument as data -- a number, 1 or -1. Passing -1 will advance the roto one container width; passing 1 will retreat one container width.

You can use these events to programatically move a roto around based on other events on your page.

If you trigger the `rotoContentChange` event on the container, the roto will remeasure itself -- allowing you to dynamically add or remove content.

The enable and disable events allow you to programmatically enable or disable the drag-to-scroll functionality; disabling a rotoed element will cause it to return to its maximum offset (normally zero) and ignore any drag events.


What options do I have, and what are the defaults?
--------------------------------------------------
Lots of options. The ones you'll generally want to use are:

- btnPrev: the css selector for the 'Previous' button. Default is '.prev'.
- btnNext: the css selector for the 'Next' button. Default is '.next'.
- btnAction: 'step' or 'shift' -- determines whether the buttons advance/retreat one item or one screen at a time. Default is 'shift'.
- direction: 'h' for horizontal, 'v' for vertical. Default is 'h'.
- snap: whether to snap to individual elements. Default is true.
- startOffset: offsets the entire roto the given number of pixels (you may want the 'active' element to be somewhere other than the left side of the container; maybe the centre of the screen)
- endOffset: creates the given number of pixels in 'dummy' space at the end of the roto. Best used in combination with startOffset.

There are more options -- power users can read the source and experiment.

The button defaults work when the buttons are INSIDE the overall containing element. If you want to put them outside (which can be useful), you need to give the containing element an id (say, 'roto'), and then id your buttons as '[id]-prev' and '[id]-next' ('roto-prev'/'roto-next'). Otherwise you can specify precisely how to identify them in the options.


How do I style Roto?
--------------------
Any way you like. I haven't supplied any examples, for reasons you can read above. You don't NEED to include any CSS for Roto to work -- the script sets the basic required styles for you. But it can certainly look (and sometimes work) better with a bit of design nous.

There are certain things that will break Roto, though:

1. The outer container must be set with overflow: hidden, position: relative.
2. The inner container must be set with position: relative, and padding and margin 0.
3. The elements must be set with display: block, float: left.

You DON'T need to set these -- the script does it for you. But be aware that if you contradict them in your own stylesheets or scripts, you could run into problems.

Otherwise, you shouldn't need to treat Roto with kid gloves. It'll take most of what you throw at it.


What doesn't work?
------------------
It might not work in IE6. I haven't tested it. Life's too short!


Acknowledgements
----------------
I must acknowledge Ganeshji Marwaha's jCarouselLite (http://www.gmarwaha.com/jquery/jcarousellite), which I used somewhat before writing Roto. Some of the option names are lifted from jCarouselLite, because there was no point being awkward by changing them.
