import argparse

def print_rate(args):
  file = args.source
  intr = args.interval
  with open(file) as f:
    content = f.readlines()
  
  content = content[1:]
  counter = 0
  prev = 0
  tdata = 0
  for c in content:
    counter += 1
    data, time = c.split(',')
    if args.isNW:
      data = data.split()[0]
    tdata += float(data)
    if counter % intr == 0 or counter== 1:
      print("%f,%s"%(tdata/intr,time),end='')
      tdata = 0
      


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=str, required=True)
    parser.add_argument('--interval', type=int, default=10)
    parser.add_argument('--isNW', action='store_true')
    args = parser.parse_args()

    print_rate(args)