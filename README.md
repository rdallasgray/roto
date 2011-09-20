What is Roto?
=============
A simple, flexible, touch-capable scrolling plugin for jQuery.
See a demo at http://rdallasgray.github.com/roto/

Roto takes an html unordered list (of anything) and makes it smoothly, swipeably scrollable on both desktop and touch devices.

Example uses include image carousels, listboxes, slideshows, etc.

Roto comes with a minimum of styling, so that you can make it look and behave however you want. It plays nicely with other plugins (Fancybox being an example), making it lightweight but very functional and flexible.


How do I use it?
----------------
1. Create a div or other block-level element. Give it an id or a classname that you can use to identify it.
2. Put an unordered list inside it.
3. Put some listitems in your list, containing whatever you want to be rotoed (normally images, or images inside links, but whatever you like).
4. Optionally, add a couple of buttons with classnames 'prev' and 'next' inside the containing element.
5. Call roto on the containing element, e.g. $("#roto-div").roto().

See the demo for an example.


Are there dependencies?
-----------------------
The only dependency is my own Bez plugin (https://github.com/rdallasgray/bez), which is used to create jQuery-compatible easing functions from cubic-bezier co-ordinates. That's just for compatibility with browsers which don't support CSS transitions, so if you're only supporting newer browsers, you don't need it. Bez is compiled into the minified distribution of Roto by default, so you don't need to separately include it.


What else do I need to know?
----------------------------
Roto works best if you call it using $(window).load() rather than $(document).ready(). This is because Webkit-based browsers don't know the dimensions of images at $(document).ready() time, and Roto relies on those dimensions. Of course, if you're giving all your images explicit dimensions anyway, you can use $(document).ready().

Roto also fires an event called 'rotoChange' when the position of the roto content is changed (and on completion of any animations). You can listen for this event on the rotoed container and use it, for example, to change other content in your page when the roto is moved. The event passes the listitem leftmost or topmost in the roto as data. So you could do something like:

$("#roto").bind("rotoChange", function(event, listitem) { $(listitem).css("color", "red") });


What options do I have, and what are the defaults?
--------------------------------------------------
Lots of options. The ones you'll generally want to use are:

- btnPrev: the css selector for the 'Previous' button. Default is '.prev'.
- btnNext: the css selector for the 'Next' button. Default is '.next'.
- direction: 'h' for horizontal, 'v' for vertical. Default is 'h'.
- snap: whether to snap to individual listitems. Default is true.

That's all. Power users have more options and should read the source and experiment.

The button defaults work when the buttons are INSIDE the overall containing element. If you want to put them outside (which can be useful), you need to give the containing element an id (say, 'roto'), and then id your buttons as '[id]-prev' and '[id]-next' ('roto-prev'/'roto-next'). Otherwise you can specify precisely how to identify them in the options.


How do I style Roto?
--------------------
Any way you like. I haven't supplied any examples, for reasons you can read above. You don't NEED to include any CSS for Roto to work -- the script sets the basic required styles for you. But it can certainly look (and sometimes work) better with a bit of design nous.

There are certain things that will break Roto, though:

1. The overall container must be set with overflow: hidden, position: relative.
2. The unordered list must be set with position: relative, white-space: nowrap, and padding and margin 0.
3. The listitems must be set with display: block, float: left, list-style: none.

You DON'T need to set these -- the script does it for you. But be aware that if you contradict them in your own stylesheets or scripts, you could run into problems.

Otherwise, you shouldn't need to treat Roto with kid gloves. It'll take most of what you throw at it.


What doesn't work?
------------------
It might not work in IE6. I haven't tested it. Life's too short!


Acknowledgements
----------------
I must acknowledge Ganeshji Marwaha's jCarouselLite (http://www.gmarwaha.com/jquery/jcarousellite), which I used somewhat before writing Roto. Some of the option names are lifted from jCarouselLite, because there was no point being awkward by changing them.