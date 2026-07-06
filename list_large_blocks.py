import re

with open('frontend/src/components/MapboxMap.tsx', 'r') as f:
    content = f.read()

# Let's find large functions or effects
effects = [(m.start(), m.end()) for m in re.finditer(r"useEffect\(\(\) => \{", content)]

def count_lines(start, end):
    return content[start:end].count('\n')

# We need to match braces to find the end of the effect, but a naive way is just to look at the next effect.
for i in range(len(effects)):
    start = effects[i][0]
    end = effects[i+1][0] if i+1 < len(effects) else len(content)
    lines = count_lines(start, end)
    if lines > 100:
        print(f"Effect {i} starting at line {content[:start].count(chr(10))} has approx {lines} lines.")

print("-----")
# Let's find large functions
funcs = [(m.start(), m.group(1)) for m in re.finditer(r"(const [a-zA-Z0-9_]+ = \(.*?\) => \{|function [a-zA-Z0-9_]+\(.*?\) \{)", content)]
for i in range(len(funcs)):
    start = funcs[i][0]
    end = funcs[i+1][0] if i+1 < len(funcs) else len(content)
    lines = count_lines(start, end)
    if lines > 200:
        print(f"Function {funcs[i][1]} starting at line {content[:start].count(chr(10))} has approx {lines} lines.")

